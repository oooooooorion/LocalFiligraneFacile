# Stage 1: Build the project
FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# Stage 2: Setup Nginx
FROM nginx:alpine as runner

COPY --from=builder /app/build /usr/share/nginx/html

# Default nginx configuration - to be replaced or supplemented
# based on the actual domain argument later.
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
EXPOSE 443
CMD ["nginx", "-g", "daemon off;"]