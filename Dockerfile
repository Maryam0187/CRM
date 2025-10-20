# Production Dockerfile
# Use the official Node.js 18 image
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the application for production
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Expose the port the app runs on
EXPOSE 3000

# Start the application in production mode
CMD ["npm", "start"]
