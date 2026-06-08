package main

import (
	"context"
	"encoding/base64"
	"encoding/base32"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"time"
)

const (
	serverHost    = "rslvd.net"
	
	// TCP ports
	tcpControlPort   = "7000"
	tcpDataPort      = "7001"
	
	// UDP ports
	udpControlPort   = "7100"
	udpDataPort      = "7101"
	
	// DNS2TCP port
	dns2tcpPort      = "7200"
	
	reconnectWait = 5 * time.Second
	version       = "1.1.0"
)

type TunnelMode string

const (
	ModeTCP     TunnelMode = "tcp"
	ModeUDP     TunnelMode = "udp"
	ModeDNS2TCP TunnelMode = "dns2tcp"
)

// resolveHost resolves a hostname using the system resolver, falling back to
// public DNS (8.8.8.8:53) if the system resolver fails.
func resolveHost(host string) (string, error) {
	addrs, err := net.DefaultResolver.LookupHost(context.Background(), host)
	if err == nil && len(addrs) > 0 {
		return addrs[0], nil
	}
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

// dialServer dials host:port using resolveHost.
func dialServer(host, port string, timeout time.Duration) (net.Conn, error) {
	ip, err := resolveHost(host)
	if err != nil {
		return nil, err
	}
	return net.DialTimeout("tcp", ip+":"+port, timeout)
}

func usage() {
	fmt.Fprintf(os.Stderr, "rslvd-tunnel v%s - Multi-protocol tunnel client\n\n", version)
	fmt.Fprintf(os.Stderr, "Usage:\n")
	fmt.Fprintf(os.Stderr, "  TCP:     rslvd-tunnel <token> <local_port>\n")
	fmt.Fprintf(os.Stderr, "  UDP:     rslvd-tunnel -udp <token> <local_port>\n")
	fmt.Fprintf(os.Stderr, "  DNS2TCP: rslvd-tunnel -dns <token> <local_port>\n\n")
	fmt.Fprintf(os.Stderr, "Examples:\n")
	fmt.Fprintf(os.Stderr, "  rslvd-tunnel abc123 8080          # TCP tunnel\n")
	fmt.Fprintf(os.Stderr, "  rslvd-tunnel -udp abc123 53       # UDP tunnel (DNS)\n")
	fmt.Fprintf(os.Stderr, "  rslvd-tunnel -dns abc123 22       # DNS2TCP tunnel (SSH over DNS)\n\n")
	fmt.Fprintf(os.Stderr, "Get your token from: https://rslvd.net/dashboard\n")
	os.Exit(1)
}

func log(format string, args ...interface{}) {
	ts := time.Now().Format("15:04:05")
	fmt.Printf("[%s] %s\n", ts, fmt.Sprintf(format, args...))
}

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

// ==================== TCP TUNNEL ====================

func connectTCPControl(token string) (net.Conn, error) {
	conn, err := dialServer(serverHost, tcpControlPort, 10*time.Second)
	if err != nil {
		return nil, fmt.Errorf("cannot reach %s:%s — %w", serverHost, tcpControlPort, err)
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

func handleTCPData(token, localPort string) {
	serverConn, err := dialServer(serverHost, tcpDataPort, 10*time.Second)
	if err != nil {
		log("Data connection failed: %v", err)
		return
	}

	fmt.Fprintf(serverConn, "DATA %s\n", token)

	ack, err := readLine(serverConn, 5*time.Second)
	if err != nil || strings.TrimSpace(ack) != "GO" {
		serverConn.Close()
		return
	}

	localConn, err := net.DialTimeout("tcp", "localhost:"+localPort, 5*time.Second)
	if err != nil {
		log("Cannot reach localhost:%s — is your service running?", localPort)
		serverConn.Close()
		return
	}

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

func runTCPTunnel(token, localPort string) error {
	log("Connecting TCP tunnel to rslvd.net...")
	conn, err := connectTCPControl(token)
	if err != nil {
		return err
	}
	defer conn.Close()

	log("✓ TCP Tunnel active!")
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
			go handleTCPData(token, localPort)
		case line == "PONG":
			// keepalive ack
		case strings.HasPrefix(line, "ERR "):
			return fmt.Errorf("server: %s", strings.TrimPrefix(line, "ERR "))
		}
	}
}

// ==================== UDP TUNNEL ====================

func runUDPTunnel(token, localPort string) error {
	log("Connecting UDP tunnel to rslvd.net...")
	
	serverIP, err := resolveHost(serverHost)
	if err != nil {
		return err
	}
	
	// Control socket for registration
	controlConn, err := net.Dial("udp", serverIP+":"+udpControlPort)
	if err != nil {
		return fmt.Errorf("cannot connect UDP control: %w", err)
	}
	defer controlConn.Close()
	
	// Send registration
	controlConn.Write([]byte("HELLO " + token + "\n"))
	
	// Wait for OK
	buf := make([]byte, 1024)
	controlConn.SetReadDeadline(time.Now().Add(5 * time.Second))
	n, err := controlConn.Read(buf)
	if err != nil {
		return fmt.Errorf("registration timeout: %w", err)
	}
	
	response := strings.TrimSpace(string(buf[:n]))
	if !strings.HasPrefix(response, "OK") {
		return fmt.Errorf("registration failed: %s", response)
	}
	
	log("✓ UDP Tunnel registered!")
	log("  Local UDP: localhost:%s", localPort)
	
	// Data socket for packet relay
	dataConn, err := net.Dial("udp", serverIP+":"+udpDataPort)
	if err != nil {
		return fmt.Errorf("cannot connect UDP data: %w", err)
	}
	defer dataConn.Close()
	
	// Local UDP socket
	localAddr, err := net.ResolveUDPAddr("udp", "localhost:"+localPort)
	if err != nil {
		return fmt.Errorf("cannot resolve local address: %w", err)
	}
	
	localConn, err := net.DialUDP("udp", nil, localAddr)
	if err != nil {
		return fmt.Errorf("cannot connect to local service: %w", err)
	}
	defer localConn.Close()
	
	// Relay packets: server -> local
	go func() {
		buf := make([]byte, 65535)
		for {
			n, err := dataConn.Read(buf)
			if err != nil {
				log("UDP server read error: %v", err)
				return
			}
			localConn.Write(buf[:n])
		}
	}()
	
	// Relay packets: local -> server
	go func() {
		buf := make([]byte, 65535)
		for {
			n, err := localConn.Read(buf)
			if err != nil {
				log("UDP local read error: %v", err)
				return
			}
			dataConn.Write(buf[:n])
		}
	}()
	
	// Keepalive
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			controlConn.Write([]byte("PING\n"))
		}
	}
}

// ==================== DNS2TCP TUNNEL ====================

// encodeDataToDNS encodes binary data into DNS-safe base32 subdomain
func encodeDataToDNS(data []byte) string {
	return base32.HexEncoding.EncodeToString(data)
}

// decodeDNSResponse decodes DNS TXT response data
func decodeDNSResponse(data []byte) ([]byte, error) {
	// Parse: DNS2TCP_RESPONSE:<base64data>
	prefix := "DNS2TCP_RESPONSE:"
	str := string(data)
	if !strings.HasPrefix(str, prefix) {
		return nil, fmt.Errorf("invalid response format")
	}
	return base64.StdEncoding.DecodeString(str[len(prefix):])
}

// buildDNSQuery builds a DNS query packet for DNS2TCP
func buildDNSQuery(sessionID string, data []byte) []byte {
	// Build query name: <data>.<session>.tunnel.rslvd.net
	var qname string
	if data != nil && len(data) > 0 {
		encoded := encodeDataToDNS(data)
		qname = encoded + "." + sessionID + ".tunnel." + serverHost
	} else {
		qname = sessionID + ".tunnel." + serverHost
	}
	
	// Build DNS query packet (simplified)
	// In production, use a proper DNS library
	buf := make([]byte, 512)
	
	// Transaction ID
	buf[0] = 0x12
	buf[1] = 0x34
	
	// Flags: Standard query
	buf[2] = 0x01
	buf[3] = 0x00
	
	// Questions: 1
	buf[4] = 0x00
	buf[5] = 0x01
	
	// Answer RRs: 0
	buf[6] = 0x00
	buf[7] = 0x00
	
	// Authority RRs: 0
	buf[8] = 0x00
	buf[9] = 0x00
	
	// Additional RRs: 0
	buf[10] = 0x00
	buf[11] = 0x00
	
	offset := 12
	
	// QNAME labels
	labels := strings.Split(qname, ".")
	for _, label := range labels {
		buf[offset] = byte(len(label))
		offset++
		copy(buf[offset:], label)
		offset += len(label)
	}
	buf[offset] = 0x00
	offset++
	
	// QTYPE: TXT (16)
	buf[offset] = 0x00
	buf[offset+1] = 0x10
	offset += 2
	
	// QCLASS: IN (1)
	buf[offset] = 0x00
	buf[offset+1] = 0x01
	offset += 2
	
	return buf[:offset]
}

func runDNS2TCPTunnel(token, localPort string) error {
	log("Connecting DNS2TCP tunnel to rslvd.net...")
	log("Note: DNS2TCP has limited bandwidth due to DNS packet size constraints")
	
	serverIP, err := resolveHost(serverHost)
	if err != nil {
		return err
	}
	
	// DNS socket
	dnsConn, err := net.Dial("udp", serverIP+":"+dns2tcpPort)
	if err != nil {
		return fmt.Errorf("cannot connect DNS2TCP server: %w", err)
	}
	defer dnsConn.Close()
	
	log("✓ DNS2TCP Tunnel active!")
	log("  Local TCP: localhost:%s", localPort)
	log("  Session:   %s", token)
	
	// Connection to local service
	var localConn net.Conn
	var connectErr error
	
	// Session state
	sessionActive := false
	buffer := make([]byte, 0)
	
	// Poll loop for DNS responses
	go func() {
		buf := make([]byte, 65535)
		for {
			dnsConn.SetReadDeadline(time.Now().Add(5 * time.Second))
			n, err := dnsConn.Read(buf)
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					continue
				}
				log("DNS read error: %v", err)
				continue
			}
			
			data, err := decodeDNSResponse(buf[:n])
			if err != nil {
				continue
			}
			
			if localConn != nil {
				localConn.Write(data)
			} else {
				buffer = append(buffer, data...)
			}
		}
	}()
	
	// Send keepalive/ping every 10 seconds
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			// Send empty query as keepalive
			query := buildDNSQuery(token, nil)
			dnsConn.Write(query)
			
			// Try to connect to local service if not connected
			if !sessionActive {
				localConn, connectErr = net.Dial("tcp", "localhost:"+localPort)
				if connectErr == nil {
					sessionActive = true
					log("Connected to local service on port %s", localPort)
					
					// Flush buffered data
					if len(buffer) > 0 {
						localConn.Write(buffer)
						buffer = nil
					}
					
					// Handle local -> server
					go func() {
						buf := make([]byte, 200) // Small chunks for DNS
						for {
							n, err := localConn.Read(buf)
							if err != nil {
								log("Local connection closed: %v", err)
								sessionActive = false
								localConn = nil
								return
							}
							
							// Send data via DNS query
							query := buildDNSQuery(token, buf[:n])
							dnsConn.Write(query)
						}
					}()
				}
			}
		}
	}
}

// ==================== MAIN ====================

func main() {
	if len(os.Args) == 2 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Printf("rslvd-tunnel v%s\n", version)
		os.Exit(0)
	}
	
	if len(os.Args) < 3 {
		usage()
	}
	
	mode := ModeTCP
	token := ""
	localPort := ""
	argIdx := 1
	
	// Parse flags
	if os.Args[argIdx] == "-udp" {
		mode = ModeUDP
		argIdx++
	} else if os.Args[argIdx] == "-dns" || os.Args[argIdx] == "-dns2tcp" {
		mode = ModeDNS2TCP
		argIdx++
	}
	
	if len(os.Args) < argIdx+2 {
		usage()
	}
	
	token = os.Args[argIdx]
	localPort = os.Args[argIdx+1]
	
	if token == "" || localPort == "" {
		usage()
	}
	
	log("rslvd-tunnel v%s - Mode: %s", version, mode)

	attempt := 0
	for {
		attempt++
		if attempt > 1 {
			log("Reconnecting in %v... (attempt %d)", reconnectWait, attempt)
			time.Sleep(reconnectWait)
		}

		var err error
		switch mode {
		case ModeTCP:
			err = runTCPTunnel(token, localPort)
		case ModeUDP:
			err = runUDPTunnel(token, localPort)
		case ModeDNS2TCP:
			err = runDNS2TCPTunnel(token, localPort)
		}
		
		if err != nil {
			log("Disconnected: %v", err)
		}
	}
}
