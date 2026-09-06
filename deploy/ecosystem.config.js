// PM2 生产守护配置
module.exports = {
  apps: [{
    name: 'habitpet',
    script: './server.js',
    cwd: '/opt/habitpet',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DATA_DIR: '/opt/habitpet/data'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/habitpet/err.log',
    out_file: '/var/log/habitpet/out.log',
    merge_logs: true,
    kill_timeout: 5000,
    listen_timeout: 8000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
