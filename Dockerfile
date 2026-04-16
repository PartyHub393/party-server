FROM node:22.21.1-slim

WORKDIR /app

RUN apt-get update -qq && \
	apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 && \
	rm -rf /var/lib/apt/lists/*

COPY . .

RUN npm ci --prefix backend --include=dev && \
	npm ci --prefix frontend --include=dev && \
	test -f backend/node_modules/dotenv/package.json && \
	test -f frontend/node_modules/vite/package.json && \
	npm run build --prefix frontend

ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start", "--prefix", "backend"]