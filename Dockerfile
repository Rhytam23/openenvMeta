FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
COPY frontend/tsconfig*.json ./
COPY frontend/vite.config.ts ./
COPY frontend/index.html ./
COPY frontend/src ./src
RUN npm run build

FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000
WORKDIR /app
COPY . .
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
RUN chmod +x entrypoint.sh && pip install --no-cache-dir -e .
EXPOSE 8000
LABEL org.openenv.tags="openenv"
ENTRYPOINT ["./entrypoint.sh"]
