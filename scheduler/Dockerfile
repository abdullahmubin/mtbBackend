FROM node:20-alpine

WORKDIR /app

# Copy only what we need for the scheduler
COPY package.json package-lock.json* ./
COPY ./src ./src
COPY ./scheduler ./scheduler

# Install production deps only
RUN npm ci --only=production

ENV NODE_ENV=production
ENV SCHEDULER_PORT=4000

EXPOSE 4000

CMD ["node", "./scheduler/server.js"]
