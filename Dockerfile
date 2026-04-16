# Use a lightweight Node.js image
FROM node:20-slim

# Set the working directory
WORKDIR /app

# Copy package.json files first to leverage Docker cache
COPY package.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies for both backend and frontend
RUN npm run install:all

# Copy the rest of your application code
COPY . .

# Build the Vite frontend
# (This runs "npm run build --prefix frontend" based on your root package.json)
RUN npm run build

# Set the port environment variable
ENV PORT=8080
EXPOSE 8080

# Start the application
# (This runs "npm run start --prefix backend" based on your root package.json)
CMD ["npm", "start"]