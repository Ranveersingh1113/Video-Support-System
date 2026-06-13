# LiveKit SFU for Fly.io. Bakes non-secret config; API keys come from the
# LIVEKIT_KEYS Fly secret at runtime (never committed).
FROM livekit/livekit-server:v1.8
COPY livekit.yaml /etc/livekit.yaml
# Base image ENTRYPOINT is /livekit-server; we only supply the config flag.
CMD ["--config", "/etc/livekit.yaml"]
