FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
COPY frontend/tsconfig*.json ./
COPY frontend/scripts ./scripts
COPY frontend/vite.config.js ./
COPY frontend/index.html ./
RUN npm ci
COPY frontend/src ./src
RUN npm run build

FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=7860
WORKDIR /app
COPY . .
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
RUN chmod +x entrypoint.sh && pip install --no-cache-dir -e .
EXPOSE 7860
LABEL org.openenv.tags="openenv"
ENTRYPOINT ["./entrypoint.sh"]
