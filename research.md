Architectural Design of a Private Real-Time Video Support Platform: Technology Evaluation, Gaps in Existing Frameworks, and Deployment Engineering
The shift in customer support operations from voice calls to contextualized visual engagement has created new technical baselines for modern customer service.1 Technical operations that involve on-site troubleshooting by field engineers, software walk-throughs by support agents, or the validation of physical industrial installations require real-time, low-latency visual and auditory communication channels.1
While third-party communications-platform-as-a-service (CPaaS) systems can facilitate rapid application development, they create systemic dependencies, introduce unpredictable data transfer and egress costs, and route highly confidential corporate conversations through external infrastructure.1
Building an internally owned, private real-time video support platform requires a deep analysis of WebRTC media topologies, an evaluation of open-source Selective Forwarding Units (SFUs), the design of distributed signaling planes, and the implementation of resilient media processing pipelines. This report evaluates the underlying mechanics of modern WebRTC architectures, analyzes the structural gaps in existing open-source frameworks, and presents a production-grade blueprint for deploying a highly secure and resilient visual support platform.
1. Architectural Paradigms of WebRTC Media Networks
Establishing a high-performance WebRTC system requires selecting a media network topology that balances low latency, client-side resource usage, and server scalability.3 WebRTC connections operate under three primary topologies: Peer-to-Peer (P2P) mesh networks, Selective Forwarding Units (SFUs), and Multipoint Control Units (MCUs).5
While a hybrid P2P architecture can reduce cloud data transfer costs by routing 1-on-1 calls directly between participants, it introduces significant security and operational issues for enterprise-grade customer support.2 P2P networks require each client to expose their public IP addresses to other participants during the Interactive Connectivity Establishment (ICE) candidate gathering phase.3 This exposure violates corporate security and data isolation standards.7
Furthermore, because P2P media streams bypass the central server, the platform cannot run server-side call recording, automated quality monitoring, or regulatory compliance audits.8
For these reasons, routing all media through a dedicated, self-hosted SFU is the standard for secure support architectures.1

Topological Attribute
Peer-to-Peer (P2P) Mesh
Selective Forwarding Unit (SFU)
Multipoint Control Unit (MCU)
Media Routing Mechanism
Direct browser-to-browser connection 8
Server-mediated routing of intact RTP packets 6
Real-time decoding, mixing, and re-encoding on the server 5
Server CPU Consumption
Extremely low (Signaling negotiation only) 6
Low-to-moderate (No transcoding or decoding) 6
Extremely high (Decodes and compresses every stream) 5
Client CPU Consumption
Scales quadratically:  based on participant count 12
Scales linearly:  based on incoming streams 6
Fixed minimum:  regardless of room size 6
Client Bandwidth
 upstream and downstream bandwidth saturation 12
Upstream: 1 stream; Downstream:  streams 6
Upstream: 1 stream; Downstream: 1 mixed stream 6
Transmission Latency
Lowest possible latency (Direct traversal path) 8
Minimal latency (<500ms forwarding delay) 6
High latency (1–3s added by transcoding step) 5
Recording Capability
Client-side capture only (Unsuitable for audits)
Server-side packet capture via plain transports 9
Native server-side saving of the mixed canvas 9

Deploying an SFU-based platform behind strict corporate firewalls and symmetric Network Address Translation (NAT) configurations requires dedicated Session Traversal Utilities for NAT (STUN) and Traversal Using Relays around NAT (TURN) architectures.3 STUN servers resolve public-facing reflexive IP addresses for approximately 65% of standard residential endpoints, but symmetric NATs and cellular network handoffs require TURN relay nodes.3
For self-hosted platforms, the open-source coturn server is the standard solution.5 When running coturn within containerized platforms like Kubernetes, the pod must run with host networking enabled (hostNetwork: true) and bypass cluster-level DNS policies to prevent routing delays and DNS resolution failures.16
To handle dynamic credentials at scale, coturn should be integrated with a shared Redis database backend.16 This allows user validation and credential rotation to run without requiring server restarts or database file reloads.16
2. Comparative Analysis of Open-Source Media Servers
Developing a private real-time support platform requires selecting an underlying open-source WebRTC media engine. The primary candidates—Janus, LiveKit, Mediasoup, and Jitsi—exhibit distinct tradeoffs in development complexity, extensibility, and resource usage.10

Technical Parameter
Janus (Meetecho)
LiveKit
Mediasoup
Jitsi (JVB)
Implementation Language
C (Core) 17
Go 17
C++ (Media path) & Node.js/Rust (Control plane) 13
Java 17
Architecture Model
Modular, plugin-based gateway 10
Integrated real-time platform 10
Low-level library component 10
Turnkey appliance suite 17
Signaling Protocol
Built-in Janus JSON API 10
Built-in proprietary Protobuf/WebSocket 11
None (Developer must implement) 13
XMPP (via Jicofo service) 17
Horizontal Scaling
Manual gateway replication behind load balancers 10
Integrated Redis-backed multi-node mesh 10
Multi-worker instances using inter-router pipes 13
Multi-bridge scaling via Jicofo routing 17
Call Recording
Native RTP dump plugin 14
External Egress container service 19
None (Requires plain transport integration) 13
Jibri container service 14
Primary Gaps
Heavy manual session keepalives; prone to thread lockups 20
Rigid, opinionated framework; high Egress memory footprint 17
No built-in signaling, authorization, or room abstractions 13
Monolithic footprint; difficult to isolate custom roles 17

Janus
Janus is an optimized, C-based WebRTC gateway built on a modular plugin architecture.10 It is highly effective for environments that require WebRTC-to-SIP bridging or telecom integrations.10
However, Janus has notable operational gaps.20 Its control plane requires client-side keepalive heartbeats sent every 30 to 60 seconds.21 If a network blip delays a heartbeat, Janus tears down the WebSocket connection along with its associated session handle, which can cause orphaned peer connections on the client side.20
Additionally, under heavy concurrent workloads, Janus can experience mutex deadlocks in its core routing engine, which can block the Admin API and stop new sessions from initializing.22
LiveKit
LiveKit is a Go-based SFU that integrates signaling, room management, and media forwarding into a single platform.10 LiveKit reduces the time-to-market for real-time video applications by providing client SDKs that handle connection states, track subscription permissions, and handle reconnections natively.11
The primary drawback of LiveKit is its highly opinionated design.17 This makes it difficult to customize low-level packet processing, implement custom encryption schemas, or run fine-grained RTP modifications.17
Furthermore, LiveKit handles media processing tasks (like call recording and RTMP streaming) using an external Egress service that runs headless Chrome instances, which has a very high memory and CPU footprint.19
Mediasoup
Mediasoup is a low-level WebRTC SFU designed to run as a Node.js or Rust library rather than a standalone application.10 Its core routing engine is written in highly optimized C++ and is exposed to the Node.js control layer through single-threaded worker subprocesses.13
To scale across multiple CPU cores, Mediasoup launches multiple worker subprocesses and binds each worker to a specific CPU core.13 If a room grows larger than a single worker's capacity (~500 total consumers), the developer must write orchestration code to route packets across workers using internal shared-memory pipes (pipeToRouter).13

Because Mediasoup does not provide signaling, authentication, or room management, developers must build these control layers from scratch, which increases initial development time.13
Jitsi
Jitsi is a mature, Java-based, turnkey video conferencing platform.17 It is designed to deploy a complete video room quickly, with pre-built web interfaces and mobile SDKs.17
While Jitsi is robust and supports automatic P2P-to-SFU escalation, it is less suitable for custom integrations that require distinct user roles (such as a customer-agent support model) and strict layout isolation.2
3. Distributed Signaling, State Synchronization, and Role-Based Access Control
The signaling plane coordinates peer connections by exchanging JavaScript Session Establishment Protocol (JSEP) metadata, which includes SDP offers, SDP answers, and trickle ICE candidates.26 Because signaling messages are ephemeral and stateful, writing this data directly to traditional relational databases can introduce database-write latency and degrade call setup performance.29
Signaling Architecture and State Synchronization
To scale a signaling plane horizontally, client WebSockets must be decoupled from the backend application logic using a pub/sub pattern.29



Client A (Agent)  ──────>  Signaling Server Node 1 (Go)
                                 │
                           
                                 │
Client B (Customer) <─────  Signaling Server Node 2 (Go)


When Client A and Client B connect to different signaling nodes, the nodes subscribe to dedicated Redis pub/sub channels mapped to each client's unique identifier.29 When Client A publishes an SDP offer or an ICE candidate, Redis routes the payload to Node 2 in sub-milliseconds, which then pushes it down Client B's active WebSocket connection.29
While Redis is the standard for low-latency, fire-and-forget signaling traffic (like ICE candidates), a resilient architecture must combine it with a transactional broker like RabbitMQ for critical control plane events 29:
Redis Pub/Sub (The Ephemeral Flow): Optimal for high-frequency connection events.29 ICE candidates are generated in rapid bursts of 10 to 20 packets per client.29 If a packet is lost, the client-side ICE agent retries naturally, meaning the message broker does not need to guarantee delivery.29
RabbitMQ (The Durable Registry): Critical for stateful administrative events, such as room billing starts, recording triggers, and regulatory compliance audits.29 RabbitMQ enforces an at-least-once delivery model, ensuring that billing and recording commands are never lost even if a signaling node restarts mid-call.29
Chat Persistence and Data Channels
When implementing the required In-Call Chat and File Sharing features, developers must choose between WebSockets and WebRTC DataChannels 1:
WebSockets: This protocol establishes a persistent, bi-directional TCP connection between the client and server.31 WebSockets guarantee ordered, error-free message delivery, which is ideal for storing chat history and file uploads in a central database for compliance and audit retrieval.27
WebRTC DataChannels: This protocol uses SCTP-over-DTLS to establish direct peer-to-peer data pathways.3 While DataChannels offer ultra-low latency, they are more complex to implement and debug.27
For customer support applications where chat transcripts must be archived and audited after the call ends, routing chat traffic over WebSockets is the standard approach.1
Cryptographically Enforced Role-Based Access Control (RBAC)
To enforce distinct permissions between Call Agents and Customers (such as restricting recording controls to agents), the system must utilize signed JSON Web Tokens (JWTs) validated at the SFU boundary.1



[Agent Client]  ──(1. Auth request)──> ──(2. Mint Signed JWT)──> [Agent Client]
       │                                                                                  │
       └─────────────────────────────(3. Connect + Pass JWT)─────────────────────────────>
                                                                                                  │
                                                                                         


These JWT access tokens are signed on the backend server using an API secret key.34 When a client attempts to connect to the SFU, the media server decodes the token, verifies its cryptographic signature, and applies the user roles and permissions defined in the token's payload.34



JSON
{
  "iss": "support-platform-backend",
  "sub": "usr_agent_88219",
  "exp": 1781347200,
  "room": "session_support_441",
  "video": {
    "roomJoin": true,
    "roomCreate": true,
    "roomAdmin": true,
    "publishSource": {
      "audio": true,
      "video": true
    },
    "subscribe": true,
    "canRecord": true
  },
  "metadata": {
    "role": "Call Agent",
    "name": "Jane Doe"
  }
}


This token-based permissions model ensures that:
Customers cannot initialize sessions, start server-side recordings, or execute administrative actions because their JWTs lack the required permission flags (roomCreate: false, canRecord: false).1
Access Control remains stateless, allowing the media server to validate client permissions on each request without querying a central database.35
4. Call Recording Pipelines and Server-Side Media Processing
Server-side WebRTC call recording is a complex, real-time media orchestration task.9 Because WebRTC streams are delivered as encrypted SRTP packets over UDP, recording requires real-time decryption, depacketization, jitter buffering, decoding, optional layout mixing, and final container muxing.9



                ┌──> Decrypt (SRTP) ──> Depayload (RTP) ──> Jitter Buffer ──> Decode (Opus/H264) ──┐
UDP Media Port ─┤                                                                                  ├──> Compositor/Mixer ──> Encode & Mux (MP4/HLS)
                └──> Decrypt (SRTP) ──> Depayload (RTP) ──> Jitter Buffer ──> Decode (Opus/H264) ──┘


Three architectural patterns are used to implement recording pipelines, each with specific resource and deployment trade-offs:

Architectural Parameter
RoomComposite (Headless Browser)
Participant/Track Egress (SDK-based)
Raw RTP Dumping (SFU-Dumping)
Media Orchestrator
Headless Chrome + GStreamer 19
Direct SDK subscription + GStreamer 19
Direct PlainTransport UDP socket captures 9
Layout Composition
Renders the full web page layout 19
No layout (Saves separate tracks) 9
No layout (Saves raw media streams) 9
Server CPU Consumption
High (~1.0 vCPU per session) 23
Low-to-moderate (~0.1 vCPU per track) 9
Extremely low (<0.01 vCPU per stream) 9
Server Memory Footprint
High (500MB–1GB per session) 9
Low (~100MB per session)
Negligible (<10MB per stream)
Lip Synchronization
Native (Handled by Chrome's clock)
Complex (Synchronized via NTP) 37
Manual post-processing required 37
Output Readiness
Immediate MP4/HLS availability 19
Requires post-call layout compilation 9
High post-processing overhead 37

RoomComposite Mechanics and CPU Overload Pitfalls
The RoomComposite recording model launches an instance of headless Chromium via Puppeteer to join the support session as a silent, non-publishing participant.19 Chromium renders the active support session’s DOM interface, applying real-time CSS transitions, grid reordering when users toggle video, and active-speaker focus states.9
GStreamer then grabs the raw video frame buffers from Chromium's rendering pipe, mixes in the composite audio stream, and encodes the output into a finalized MP4 container or HLS segments.19
While RoomComposite yields a production-ready file instantly, it has substantial hardware demands.19 Running a full headless browser instance, handling WebRTC decryption, decoding multiple incoming 720p H.264 streams, and encoding the output canvas consumes significant compute resources.9
A single Chromium instance capturing a 1-on-1 support call at 720p/30fps can consume between 0.5 to 1.0 physical CPU core and 500MB to 1GB of RAM.9
If a support platform handles  concurrent sessions, the server-side CPU utilization for recording scales linearly:

On an 8-core server, initiating 10 concurrent support recordings using the RoomComposite model will saturate the CPU, causing severe context switching, packet loss in active media routing, and visual artifacts or freezes in both the active call and the saved file.23
GStreamer vs. FFmpeg for Server-Side Processing
For self-hosted recording pipelines, selecting the underlying media framework dictates the platform's ability to handle dynamic call states:
FFmpeg (The Static Hammer): Optimal for static, 1-on-1 support recordings.9 It uses standard libavcodec to ingest a static RTP stream (e.g., from Janus or Mediasoup) and mux it to disk.9 However, FFmpeg pipelines are structurally rigid.9 If a supervisor joins the call or the agent screen-shares mid-session, FFmpeg cannot dynamically add a new input stream without restarting the CLI process, which disrupts the recording.9
GStreamer (The Dynamic Graph): Designed as a modular media graph where pipelines can be modified programmatically during runtime.9 Using features like "Request Pads" on compositor elements, a developer can dynamically bind a new participant's stream to the running recorder.9 GStreamer also supports hardware-accelerated encoding plugins (such as NVIDIA’s nvv4l2h264enc), which offloads encoding tasks from CPU cores to GPU hardware.39



               ┌──> [udpsrc 1] ──> [jitterbuffer 1] ──> [decoder 1] ──┐
GStreamer Graph ──> [udpsrc 2] ──> [jitterbuffer 2] ──> [decoder 2] ──┼──> [compositor] ──> [encoder] ──> [filesink]
               └──> [udpsrc 3] ──> [jitterbuffer 3] ──> [decoder 3] ──┘ (Request pads allow on-the-fly linking)


Low-Resource Recording via Raw RTP Dumping
To bypass the high CPU overhead of headless browsers and real-time transcoding, platforms can record raw incoming RTP packets directly from the SFU's transport layer.9 Using Mediasoup or Janus, the system creates a plainTransport UDP socket that forwards unencrypted RTP packets for each participant stream directly to local storage.9

Because the server does not decode, mix, or transcode the media during the active call, server CPU overhead remains negligible.9 After the call ends, a background post-processing job reads the raw RTP dump files, aligns the audio and video tracks using RTCP Sender Report NTP timestamps to resolve lip-sync issues, and multiplexes them into a standard MP4 file.9
5. Reconnection Mechanics, Network State Recovery, and Fault Tolerance
Support interactions often occur over unstable network paths, such as customers switching between Wi-Fi and cellular networks, or agents experiencing packet loss on VPNs.1 Raw WebRTC does not handle reconnections natively.40
If a network interruption occurs, the underlying RTCPeerConnection transitions its iceConnectionState to disconnected and eventually to failed, leaving media streams permanently frozen.40
To prevent calls from dropping, a production support platform must implement a multi-layered auto-heal model 40:



                                    ┌─── (Yes) ───> Re-establish Connection (Seamless)
                                    │
Network Drop ───> Grace Window (30s) ───
                                    │
                                    └─── (No) ────> Terminate Session & Cleanup Resources 


ICE Restart Mechanics
An ICE restart allows an active RTCPeerConnection to negotiate a new media path over a changed network interface without tearing down the existing session or resetting cryptographic keys.43
An ICE restart is executed through a precise sequence of client-side API calls and signaling exchanges 43:
Detection: The client browser detects that the iceConnectionState has transitioned to failed or disconnected.45
Trigger: The client calls RTCPeerConnection.restartIce().45 This API marks the peer connection as requiring a restart and triggers a negotiationneeded event.45
Offer Generation: The next call to createOffer() automatically includes the iceRestart: true flag.45 This offer contains fresh, randomly generated ice-ufrag (username fragment) and ice-pwd (password) values in the SDP body.43
Exchange: The local offer is sent over the re-established signaling channel to the remote peer (or SFU).40
Answer: The remote peer processes the new offer, detects the changed ICE credentials, restarts its own ICE agent, and returns a matching SDP answer.43
Resolution: Both endpoints gather new ICE candidates, run connectivity checks, and switch media routing to the new network path.43
By keeping the DTLS keys and active transceivers intact, media can resume in a few hundred milliseconds, ensuring a seamless user experience during network handoffs.44
Transport Swapping and Identity Preservation
When network dropouts are prolonged, the underlying signaling socket and peer connection object may be destroyed.40 To handle these events gracefully, client SDKs implement a transport swapping mechanism 40:
WebSocket Jittered Backoff: When the signaling channel drops, the client socket attempts reconnection using an exponential backoff algorithm (~500ms to 30s).40
Object Isolation: The SDK maintains a stable, high-level RemotePeer object instance that is decoupled from the low-level connection states.40 This object preserves the same remote.id, metadata, and registered UI listeners.40
Physical Transport Swap: Once the signaling WebSocket is restored, the SDK creates a new RTCPeerConnection instance with fresh TURN credentials, silently replacing the broken transport.40
Stable Stream ID Re-Binding: Although the physical MediaStream object identity changes, its internal stream.id remains stable.40 The SDK fires a stream-added event with the stable stream ID, prompting the UI to re-bind the new stream buffer to the existing <video> element without tearing down the layout.40



 <─────────────(Binds to Stable Peer ID / Stream ID)──────────────
                                                                                                  │
                                                                                          (Underlying Swap)
                                                                                                  │
                                   Broken RTCPeerConnection ──> Swap ──> Fresh RTCPeerConnection (New TURN Creds)


Server-Side Grace Periods and Session Cleanup
While client-side recovery is critical, the server-side media engine must manage resources carefully during disconnects to avoid memory leaks from "ghost" sessions 20:
Session State Buffering: When a participant disconnects abruptly, the server buffers their session state for a configurable grace window (typically 15 to 30 seconds).1 During this window, the server suppresses "participant left" events, keeping the call active for the remaining peer.1
Stalled Egress Avoidance: If an agent disconnects during an active recording session, the server-side Egress worker can block on open GStreamer or WebRTC playout futures.47 To prevent workers from hanging indefinitely, the Egress engine must wrap close sequences in bounded async timeouts (10–15 seconds), forcing container teardown and writing finalized metadata to the database if the timeout is exceeded.18
6. Security Protocols, Compliance, and Technical Innovations
A private real-time support platform must secure all media transmissions, protect client environments, and plan for future technical integrations.1
WebRTC Mandatory Security Stack
WebRTC enforces strict, non-configurable security protocols at the browser and transport layers 48:
Secure Origin Enforcement: Browsers restrict camera and microphone access to secure origins (HTTPS and localhost) through the getUserMedia() API.28 If active mixed content is loaded on an HTTPS page (such as insecure HTTP scripts), browsers disable WebRTC APIs to prevent malicious redirection of media streams.28
DTLS-SRTP Key Exchange: WebRTC mandates DTLS key negotiation (RFC 5764) to calculate temporary, unique keys for Secure Real-time Transport Protocol (SRTP) streams.48 This prevents intermediate servers (such as TURN relays) from accessing unencrypted media payloads.48
Cipher Suites and AEAD: Modern WebRTC connections utilize advanced AEAD (Authenticated Encryption with Associated Data) ciphers like AES-128-GCM or AES-256-GCM.3 GCM ciphers provide concurrent payload encryption and tamper detection in a single, high-performance operation.3
End-to-End Encryption (SFrame): While standard SFUs decrypt SRTP packets on the server to read routing headers, complete end-to-end encryption can be achieved using SFrame (RFC 9678) layered on top of SRTP.3 SFrame encrypts the underlying media frame before packetization, ensuring that even a compromised server cannot view the raw media.3
Emerging Real-Time Innovations
AI Media Pipelines: Modern media platforms are integrating real-time speech processing and virtual assistant capabilities.17 Frameworks like LiveKit Agents let developers bridge WebRTC media streams with Large Language Models (LLMs) and Text-to-Speech (TTS) engines with sub-100ms latency.17 To manage LLM costs, tools like Portkey provide server-side rate limits, budget controls, and safety guardrails.49
Server-Side Audio Processing: Platforms are exploring server-side audio diagnostic pipelines.50 By decoding incoming Opus streams to raw PCM data on the SFU, the server can apply Recurrent Neural Network (RNN) noise suppression models before forwarding the clean audio, which improves call quality for users in noisy environments.50
7. Exhaustive Architectural Blueprint and Implementation Roadmap
To deliver a completely private, highly resilient real-time support platform that meets all functional requirements, the following unified system design is recommended 1:



                              ┌───────────────────────── ──────────────────────────┐
                              │                                                                  │
                    (HTTP Auth / Tokens)                                                (WS Signaling & Media)
                              │                                                                  │
                              ▼                                                                  ▼
 <──> <──> <──> ──>


Backend Control Plane
Application Server (Go): Run a horizontally scaled Go API backend to handle user authentication, token generation, and audit logging.4
Database (PostgreSQL): Persist relational session metadata, participant durations, and chat transcripts for post-call compliance audits.1
State Cache (Redis): Deploy a clustered Redis layer to coordinate live room states, handle signaling message routing, and validate short-lived TURN credentials.4
Media Routing and NAT Traversal
Selective Forwarding Unit (LiveKit SFU): Run self-hosted LiveKit instances.10 LiveKit coordinates real-time video forwarding, manages active room states, and handles client-side connection recovery.10
TURN Instances (coturn): Deploy a pool of coturn instances as a Kubernetes DaemonSet using host networking.16 This ensures reliable connection paths for clients behind strict corporate NAT configurations.3
Dynamic Call Recording Pipeline
LiveKit Egress Service: Run the LiveKit Egress container service as an independent pool scaled separately from the main SFU nodes.19
Resource Optimizations:
For high-concurrency support centers, use Participant or Track Egress to record raw video and audio tracks directly to S3-compatible storage without transcoding.9 Run an asynchronous worker pool (using FFmpeg) to assemble these tracks into layout templates post-call, avoiding server-side CPU spikes during live sessions.9
For low-concurrency environments requiring instant, mixed recording availability, use RoomComposite Egress with custom web templates.19 Ensure each recording worker node is provisioned with at least 4 CPU cores and 4GB of RAM, and scale these nodes dynamically based on active recording demand.19
Storage Integration: Configure the Egress service to stream finished files directly to a self-hosted, S3-compatible object storage cluster (such as MinIO), keeping all media payloads within your private infrastructure.19
Architecture Blueprint Configuration Matrix
To deploy the recommended architecture successfully, the following configuration parameters should be applied to each system component 1:

Architectural Component
Core Technology
Configuration Parameter
Value/Strategy
Media SFU
LiveKit Server 10
port

rtc.use_external_ip

redis.address
7880 (WebSocket HTTP API)

true (Enforce public SFU interface resolution)

IP address of the clustered state cache 16
NAT Traversal Relay
coturn Server 5
listening-port

use-auth-secret

redis connection string
3478 (UDP/TCP binding)

true (Enable shared secret authentication)

Connection URL of the state cache database 16
Recording Engine
LiveKit Egress 19
enable_chrome_sandbox

cap_add

redis.address
true (Enforce Chromium runtime sandboxing) 19

SYS_ADMIN (Grant container sandbox privileges) 19

IP address of the clustered state cache 16
Signaling Plane
Go / WebSockets 4
heartbeat_interval

max_message_size
10000ms (Ping-pong check interval)

65536 bytes (Protect socket from buffer exhaustion)
Storage Target
MinIO Object Store 19
force_path_style

bucket
true (Pass bucket name in URL path, not subdomain) 19

customer-support-recordings 19
Relational Database
PostgreSQL 4
max_connections

sslmode
200 (Configure connection pool)

verify-full (Enforce TLS validation for compliance)

Works cited
AtomQuest Hackathon 1.0 Finale Problem Statement.docx
Reduce WebRTC Infrastructure Costs with a Hybrid P2P Architecture, accessed on June 13, 2026, https://webrtc.ventures/2026/01/reduce-webrtc-infrastructure-costs-with-a-hybrid-p2p-architecture/
WebRTC Architecture for Production: SFU, MCU, MoQ Guide - Fora Soft, accessed on June 13, 2026, https://www.forasoft.com/learn/webrtc-architecture-production-systems
WebRTC Tech Stack Guide: Architecture for Scalable Real-Time Applications, accessed on June 13, 2026, https://webrtc.ventures/2026/01/webrtc-tech-stack-guide-architecture-for-scalable-real-time-applications/
WebRTC Server: Types, Architecture, and How to Choose One - LiveAPI Blog, accessed on June 13, 2026, https://liveapi.com/blog/webrtc-server/
SFU vs MCU vs P2P: WebRTC Architectures Explained - Metered, accessed on June 13, 2026, https://www.metered.ca/blog/sfu-vs-mcu-vs-p2p-webrtc-architectures-explained/
WebRTC Security: Best Practices and Key Risks Explained - Digital Samba, accessed on June 13, 2026, https://www.digitalsamba.com/blog/webrtc-security
Building Real-Time P2P Communication: A Deep Dive into WebRTC, ICE, STUN, and TURN, accessed on June 13, 2026, https://akashsahani2001.medium.com/building-real-time-p2p-communication-a-deep-dive-into-webrtc-ice-stun-and-turn-e645492230c5
The Recording Engine: FFmpeg vs. GStreamer for Server-Side Media Processing, accessed on June 13, 2026, https://dev.to/deepak_mishra_35863517037/the-recording-engine-ffmpeg-vs-gstreamer-for-server-side-media-processing-325o
Janus vs LiveKit vs mediasoup — Which WebRTC Server Should You Choose?, accessed on June 13, 2026, https://mylinehub.com/articles/janus-vs-livekit-vs-mediasoup-webrtc-server-comparison
Choosing the Right SFU: Janus vs. Mediasoup vs. LiveKit for Telemedicine Platforms, accessed on June 13, 2026, https://trembit.com/blog/choosing-the-right-sfu-janus-vs-mediasoup-vs-livekit-for-telemedicine-platforms/
Multiple dozens or a few hundred simultaneous speakers in an audio only SFU? - Reddit, accessed on June 13, 2026, https://www.reddit.com/r/WebRTC/comments/1q4fn5k/multiple_dozens_or_a_few_hundred_simultaneous/
mediasoup, Janus, LiveKit, Jitsi Videobridge, Pion: Choosing an SFU, accessed on June 13, 2026, https://www.forasoft.com/learn/video-streaming/articles-streaming/sfu-comparison-mediasoup-janus-livekit-jitsi-pion
WebRTC Media servers, Why, When, and How to choose one for your next application, accessed on June 13, 2026, https://centedge.io/webrtc-media-servers-why-when-and-how-to-choose-one-for-your-next-application/
Choosing the Right Protocol: RTMP vs WebRTC vs RTSP for Conference, Live Streaming and Surveillance - AVIXA Xchange, accessed on June 13, 2026, https://xchange.avixa.org/posts/choosing-the-right-protocol-rtmp-vs-webrtc-vs-rtsp-for-live-streaming-and-surveillance
K8s architecture for self-hosted WebRTC vehicle teleoperation across 3 regions -- advice needed : r/kubernetes - Reddit, accessed on June 13, 2026, https://www.reddit.com/r/kubernetes/comments/1tuoquf/k8s_architecture_for_selfhosted_webrtc_vehicle/
Open Source WebRTC Media Servers: Choosing the Right One for Your Use Case, accessed on June 13, 2026, https://webrtc.ventures/2026/06/open-source-webrtc-media-servers/
Self-hosted deployments - LiveKit Documentation, accessed on June 13, 2026, https://docs.livekit.io/deploy/custom/deployments/
Egress overview | LiveKit Documentation, accessed on June 13, 2026, https://docs.livekit.io/transport/media/ingress-egress/egress/
Locked websocket - transport mutex is being held · Issue #1274 · meetecho/janus-gateway, accessed on June 13, 2026, https://github.com/meetecho/janus-gateway/issues/1274
Janus gateway videoroom cancels connection after 60 seconds - Stack Overflow, accessed on June 13, 2026, https://stackoverflow.com/questions/61883220/janus-gateway-videoroom-cancels-connection-after-60-seconds
Lots of connections and sessions > Trouble with websocket - Janus WebRTC Server, accessed on June 13, 2026, https://janus.discourse.group/t/lots-of-connections-and-sessions-trouble-with-websocket/871
Breaking the Limits: Hybrid WebRTC Load Testing with k6 and xk6-browser, accessed on June 13, 2026, https://dev.to/deepak_mishra_35863517037/breaking-the-limits-hybrid-webrtc-load-testing-with-k6-and-xk6-browser-4gf0
Top 15 WebRTC Alternatives - Dyte.io, accessed on June 13, 2026, https://dyte.io/blog/webrtc-alternatives/
Participants - LiveKit Swift SDK, accessed on June 13, 2026, https://livekit-client-sdk-swift.mintlify.app/concepts/participants
WebRTC Signaling Server: How It Works, Build One (Node.js), or Skip It - Medium, accessed on June 13, 2026, https://medium.com/@jamesbordane57/webrtc-signaling-server-how-it-works-build-one-node-js-or-skip-it-890e244d90ae
WebSocket vs WebRTC: When to Use Each Protocol, accessed on June 13, 2026, https://websocket.org/comparisons/webrtc/
RFC 8827: WebRTC Security Architecture, accessed on June 13, 2026, https://www.rfc-editor.org/info/rfc8827/
The Nervous System: Designing Distributed Signaling with Redis and RabbitMQ, accessed on June 13, 2026, https://dev.to/deepak_mishra_35863517037/the-nervous-system-designing-distributed-signaling-with-redis-and-rabbitmq-176f
Audit Trails for Accountability in Large Language Models - arXiv, accessed on June 13, 2026, https://arxiv.org/html/2601.20727v1
WebSocket vs WebRTC DataChannel: Choosing the Right Real-Time Tech - VideoSDK, accessed on June 13, 2026, https://videosdk.live/developer-hub/webrtc/websocket-vs-webrtc-datachannel
WebRTC vs WebSockets: What Are the Differences? - GetStream.io, accessed on June 13, 2026, https://getstream.io/blog/webrtc-websockets/
WebRTC vs WebSocket Explained: When to Use What (A Real-World Story), accessed on June 13, 2026, https://dev.to/abdullahmubin/webrtc-vs-websocket-explained-when-to-use-what-a-real-world-story-5de9
Tokens & grants - LiveKit Documentation, accessed on June 13, 2026, https://docs.livekit.io/frontends/reference/tokens-grants/
What is RBAC JWT-Based Authentication? - hoop.dev, accessed on June 13, 2026, https://hoop.dev/blog/what-is-rbac-jwt-based-authentication
Communication Between Client and Server - mediasoup, accessed on June 13, 2026, https://mediasoup.org/documentation/v3/communication-between-client-and-server/
Synchronization among Webrtc audio and video RTP streams. - Google Groups, accessed on June 13, 2026, https://groups.google.com/g/discuss-webrtc/c/sh8CiknYjAA
Scalable Video Conferencing Using SDN Principles - arXiv, accessed on June 13, 2026, https://arxiv.org/html/2503.11649v1
Improve performance Gstreamer pipeline for webrtc in Jetson AGX, accessed on June 13, 2026, https://forums.developer.nvidia.com/t/improve-performance-gstreamer-pipeline-for-webrtc-in-jetson-agx/200865
WebRTC Reconnect: Auto-Heal a Call | @metered-ca/peer - DEV Community, accessed on June 13, 2026, https://dev.to/alakkadshaw/webrtc-reconnect-auto-heal-a-call-metered-capeer-36hh
ICE restarts - by Philipp Hancke - Medium, accessed on June 13, 2026, https://medium.com/@fippo/ice-restarts-5d759caceda6
Reconnect and resume transport · Issue #979 · meetecho/janus-gateway - GitHub, accessed on June 13, 2026, https://github.com/meetecho/janus-gateway/issues/979
Lifetime of a WebRTC session - Web APIs | MDN, accessed on June 13, 2026, https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Session_lifetime
ICE Restart - BlogGeek.me, accessed on June 13, 2026, https://bloggeek.me/webrtcglossary/ice-restart/
RTCPeerConnection: restartIce() method - Web APIs | MDN, accessed on June 13, 2026, https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce
How can WebRTC reconnect to the same peer after disconnection? - Stack Overflow, accessed on June 13, 2026, https://stackoverflow.com/questions/32047777/how-can-webrtc-reconnect-to-the-same-peer-after-disconnection
AgentSession close path hangs indefinitely when participant disconnects mid-speech · Issue #5497 · livekit/agents - GitHub, accessed on June 13, 2026, https://github.com/livekit/agents/issues/5497
WebRTC Security: DTLS-SRTP, Encryption, and Token Authorization [2026], accessed on June 13, 2026, https://antmedia.io/webrtc-security/
LiveKit - Portkey Docs, accessed on June 13, 2026, https://docs.portkey.ai/docs/integrations/agents/livekit
Server-side WebRTC noise reduction with Pion FFmpeg and RNN filtering - Reddit, accessed on June 13, 2026, https://www.reddit.com/r/WebRTC/comments/1ts2npi/serverside_webrtc_noise_reduction_with_pion/
Scaling LiveKit Egress for Recordings (Private Meetings + Livestream Platform), accessed on June 13, 2026, https://dev.to/pitchers_9080cb6e0fa09187/scaling-livekit-egress-for-recordings-private-meetings-livestream-platform-1jpn
