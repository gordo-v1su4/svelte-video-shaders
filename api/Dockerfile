# Multi-stage build for Essentia + FastAPI
FROM python:3.11-slim as builder

# Install build dependencies for Essentia
# libtag1-dev may not be available in all Debian versions, so we make it optional
RUN apt-get update && \
    apt-get install -y --fix-broken || true && \
    apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libyaml-dev \
    libfftw3-dev \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libswresample-dev \
    python3-dev \
    && (apt-get install -y --no-install-recommends libtag1-dev || \
        apt-get install -y --no-install-recommends libtag-dev || true) \
    && rm -rf /var/lib/apt/lists/*

# Install Essentia and Python dependencies
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Runtime stage
FROM python:3.11-slim

# Note: Essentia Python package typically includes statically linked libraries
# If runtime errors occur about missing libraries, we'll add them back
# For now, we skip runtime deps to get the build working

# Copy Python packages from builder
COPY --from=builder /root/.local /root/.local

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

# Copy application code
WORKDIR /app
COPY main.py .

# Expose port (default 8000, can be overridden)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

