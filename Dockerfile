FROM node:18-alpine AS frontend
WORKDIR /fe
COPY dashboard/package.json /fe/package.json
COPY dashboard/vite.config.js /fe/vite.config.js
COPY dashboard/index.html /fe/index.html
COPY dashboard/src /fe/src
RUN npm ci || npm install
RUN npm run build

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps (install minimal utilities and clean up)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# Copy backend source
COPY main.py transformations.py /app/
COPY templates /app/templates
COPY --from=frontend /fe/dist /app/static

# Expose port for Render
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
