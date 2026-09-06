#!/usr/bin/env bash
set -e
# HabitPet 一键部署脚本（腾讯云轻量服务器 / Ubuntu 20.04+）
# 用法：在服务器上执行  bash deploy/deploy.sh

DOMAIN=${DOMAIN:-""}            # 例如 habitpet.yourdomain.com，留空则只用 IP
EMAIL=${EMAIL:-""}              # 用于 Let's Encrypt 证书
NODE_VER=${NODE_VER:-"22"}
APP_DIR=${APP_DIR:-"/opt/habitpet"}
USER=${USER:-"ubuntu"}

echo "== 1. 更新系统并安装依赖 =="
sudo apt-get update
sudo apt-get install -y curl git nginx certbot python3-certbot-nginx

echo "== 2. 安装 Node.js ${NODE_VER} =="
curl -fsSL https://deb.nodesource.com/setup_${NODE_VER}.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "== 3. 创建应用目录 =="
sudo mkdir -p ${APP_DIR}
sudo chown ${USER}:${USER} ${APP_DIR}

# 代码应已通过 git clone 或 scp 放到 APP_DIR；若为空则提示
echo "== 4. 检查代码 =="
if [ ! -f "${APP_DIR}/server.js" ]; then
  echo "请将 habitpet 代码放到 ${APP_DIR} 后再执行本脚本。"
  echo "例如：git clone https://github.com/yourname/habitpet.git ${APP_DIR}"
  exit 1
fi

cd ${APP_DIR}

echo "== 5. 安装依赖并复制配置 =="
npm install pm2 -g
[ ! -f ".env" ] && cp .env.example .env

sudo mkdir -p /var/log/habitpet
cp deploy/ecosystem.config.js .

sudo cp deploy/habitpet.service /etc/systemd/system/habitpet.service
sudo sed -i "s|/opt/habitpet|${APP_DIR}|g" /etc/systemd/system/habitpet.service
sudo systemctl daemon-reload
sudo systemctl enable habitpet

echo "== 6. 启动服务 =="
sudo systemctl start habitpet

# 等待服务启动
sleep 3
if ! curl -s http://127.0.0.1:3000/api/species >/dev/null; then
  echo "服务未在 3000 端口响应，请检查日志：journalctl -u habitpet -n 50"
  exit 1
fi

echo "== 7. 配置 Nginx =="
if [ -n "$DOMAIN" ]; then
  sudo cp deploy/nginx.conf /etc/nginx/sites-available/habitpet
  sudo sed -i "s/habitpet\.example\.com/${DOMAIN}/g" /etc/nginx/sites-available/habitpet
  sudo sed -i "s|/opt/habitpet|${APP_DIR}|g" /etc/nginx/sites-available/habitpet
  sudo ln -sf /etc/nginx/sites-available/habitpet /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl restart nginx
  echo "== 8. 申请 HTTPS 证书 =="
  sudo certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${EMAIL}
else
  echo "未设置 DOMAIN，跳过 HTTPS。生产环境强烈建议配置域名+证书。"
fi

echo "== 部署完成 =="
echo "访问地址：${DOMAIN:-$(curl -s ifconfig.me)}"
echo "管理日志：sudo journalctl -u habitpet -f"
echo "PM2 管理：pm2 logs habitpet"
