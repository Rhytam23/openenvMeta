FROM python:3.10-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/tmp \
    PORT=7860

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency management
RUN pip install --no-cache-dir uv

# Copy project files
COPY . .

# Install project dependencies
RUN uv pip install --system -e .

# Make entrypoint script executable
RUN chmod +x entrypoint.sh

# Expose port 7860 (HuggingFace default)
EXPOSE 7860

# Metadata tag
LABEL org.openenv.tags="openenv"

# Run the OpenEnv server via entrypoint
ENTRYPOINT ["./entrypoint.sh"]
