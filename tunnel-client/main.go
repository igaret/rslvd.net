package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"time"
)

const (
	serverHost    = "rslvd.net"
	controlPort   = "7000"
	dataPort      = "7001"
	reconnectWait = 5 * time.Second
	version       = "1.0.2"
)

// resolveHost resolves a hostname using the system resolver, falling back to
// public DNS (8.8.8.8:53) if the system resolver fails or returns no results.
// This fixes Android/Termux where /etc/resolv.conf points to ::1 (broken).
func resolveHost(host string) (string, error) {
	addrs, err := net.DefaultResolver.LookupHost(context.Background(), host)
	if err == nil && len(addrs) > 0 {
		return addrs[0], nil
	}
	// Fallback: query 8.8.8.8 directly
	r := &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			return net.DialTimeout("udp", "8.8.8.8:53", 3*time.Second)
		},
	}
	addrs, err2 := r.LookupHost(context.Background(), host)
	if err2 != nil {
		return "", fmt.Errorf("DNS lookup failed (system: %v; fallback: %v)", err, err2)
	}
	if len(addrs) == 0 {
		return "", fmt.Errorf("DNS lookup returned no addresses for %s", host)
	}
	return addrs[0], nil
}

// dialServer dials host:port using resolveHost to handle broken system DNS.
func dialServer(host, port string, timeout time.Duration) (net.Conn, error) {
	ip, err := resolveHost(host)
	if err != nil {
		return nil, err
	}
	return net.DialTimeout("tcp", ip+":"+port, timeout)
}

func usage() {
	fmt.Fprintf(os.Stderr, "rslvd-tunnel v%s\n\n", version)
	fmt.Fprintf(os.Stderr, "Usage:\n")
	fmt.Fprintf(os.Stderr, "  rslvd-tunnel <token> <local_port>\n\n")
	fmt.Fprintf(os.Stderr, "Example:\n")
	fmt.Fprintf(os.Stderr, "  rslvd-tunnel abc123 8080\n\n")
	fmt.Fprintf(os.Stderr, "Get your token from: https://rslvd.net/dashboard\n")
	os.Exit(1)
}

func log(format string, args ...interface{}) {
	ts := time.Now().Format("15:04:05")
	fmt.Printf("[%s] %s\n", ts, fmt.Sprintf(format, args...))
}

// readLine reads one '\n'-terminated line from conn one byte at a time.
// This guarantees no bytes beyond the newline are consumed from the socket,
// which is essential before handing the connection off for binary protocols.
func readLine(conn net.Conn, timeout time.Duration) (string, error) {
	conn.SetReadDeadline(time.Now().Add(timeout))
	defer conn.SetReadDeadline(time.Time{})
	var line []byte
	buf := make([]byte, 1)
	for {
		_, err := conn.Read(buf)
		if err != nil {
			return "", err
		}
		if buf[0] == '\n' {
			break
		}
		line = append(line, buf[0])
	}
	return strings.TrimRight(string(line), "\r"), nil
}

func connectControl(token string) (net.Conn, error) {
	conn, err := dialServer(serverHost, controlPort, 10*time.Second)
	if err != nil {
		return nil, fmt.Errorf("cannot reach %s:%s — %w", serverHost, controlPort, err)
	}

	fmt.Fprintf(conn, "HELLO %s\n", token)

	line, err := readLine(conn, 10*time.Second)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("no response from server: %w", err)
	}

	if strings.HasPrefix(line, "ERR ") {
		conn.Close()
		return nil, fmt.Errorf("server error: %s", strings.TrimPrefix(line, "ERR "))
	}
	if !strings.HasPrefix(strings.TrimSpace(line), "OK") {
		conn.Close()
		return nil, fmt.Errorf("unexpected server response: %s", line)
	}

	return conn, nil
}

func handleDataConnection(token, localPort string) {
	// Connect to server data port
	serverConn, err := dialServer(serverHost, dataPort, 10*time.Second)
	if err != nil {
		log("Data connection failed: %v", err)
		return
	}

	// Identify this data channel
	fmt.Fprintf(serverConn, "DATA %s\n", token)

	// Read the ack byte-by-byte — must not over-read past GO\n or WebSocket
	// upgrade bytes (and other binary protocols) will be silently lost.
	ack, err := readLine(serverConn, 5*time.Second)
	if err != nil || strings.TrimSpace(ack) != "GO" {
		serverConn.Close()
		return
	}

	// Connect to local service
	localConn, err := net.DialTimeout("tcp", "localhost:"+localPort, 5*time.Second)
	if err != nil {
		log("Cannot reach localhost:%s — is your service running?", localPort)
		serverConn.Close()
		return
	}

	// Bidirectional bridge
	go func() {
		defer serverConn.Close()
		defer localConn.Close()
		io.Copy(serverConn, localConn)
	}()
	go func() {
		defer serverConn.Close()
		defer localConn.Close()
		io.Copy(localConn, serverConn)
	}()
}

func runTunnel(token, localPort string) error {
	log("Connecting to rslvd.net...")
	conn, err := connectControl(token)
	if err != nil {
		return err
	}
	defer conn.Close()

	log("✓ Tunnel active!")
	log("  Local:   localhost:%s", localPort)
	log("  (Ctrl+C to stop)")

	for {
		line, err := readLine(conn, 60*time.Second)

		if err != nil {
			if err == io.EOF {
				return fmt.Errorf("server closed connection")
			}
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				_, werr := fmt.Fprintf(conn, "PING\n")
				if werr != nil {
					return fmt.Errorf("keepalive failed: %w", werr)
				}
				continue
			}
			return fmt.Errorf("connection lost: %w", err)
		}

		switch {
		case line == "CONNECT":
			go handleDataConnection(token, localPort)
		case line == "PONG":
			// keepalive ack, do nothing
		case strings.HasPrefix(line, "ERR "):
			return fmt.Errorf("server: %s", strings.TrimPrefix(line, "ERR "))
		}
	}
}

func main() {
	if len(os.Args) == 2 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Printf("rslvd-tunnel v%s\n", version)
		os.Exit(0)
	}

	if len(os.Args) != 3 {
		usage()
	}

	token := os.Args[1]
	localPort := os.Args[2]

	if token == "" || localPort == "" {
		usage()
	}

	log("rslvd-tunnel v%s", version)

	attempt := 0
	for {
		attempt++
		if attempt > 1 {
			log("Reconnecting in %v... (attempt %d)", reconnectWait, attempt)
			time.Sleep(reconnectWait)
		}

		err := runTunnel(token, localPort)
		if err != nil {
			log("Disconnected: %v", err)
		}
	}
}
