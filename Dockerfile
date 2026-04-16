FROM node:22.21.1-slim

WORKDIR /app

RUN apt-get update -qq && \
	apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 && \
	rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/

RUN npm ci --prefix backend && npm ci --prefix frontend --include=dev

COPY . .

RUN npm run build --prefix frontend

ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start", "--prefix", "backend"]