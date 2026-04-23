FROM python:3.11-slim

WORKDIR /app

# System deps for any wheels that need to compile
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps at image-build time. The agent source itself is
# volume-mounted at runtime so you can edit without rebuilding.
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt flask==3.0.3 \
    && rm /tmp/requirements.txt

# Agent code & HTTP wrapper get mounted over this via docker-compose.
COPY . /app

EXPOSE 8001

CMD ["python3", "/app/server.py"]