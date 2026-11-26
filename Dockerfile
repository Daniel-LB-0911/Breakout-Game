# 第一階段：使用 Node 22 編譯打包前端專案
FROM node:22-alpine AS builder
WORKDIR /app

# 先複製套件清單並安裝（可利用 Docker 快取加速下次部署）
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# 複製剩餘程式碼並執行 Vite 打包（輸出到 /app/dist）
COPY . .
RUN yarn build

# 第二階段：改用極輕量的 Nginx 來跑靜態網頁
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]