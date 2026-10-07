#!/bin/sh
# Restore dashboard integration after DSM regenerates nginx configuration.
APP=/volume1/docker/anker-web
case "$1" in
 start)
  cp "$APP/deploy/http.anker.conf" /etc/nginx/conf.d/http.anker.conf
  cp "$APP/deploy/anker-web.service" /etc/systemd/system/anker-web.service
  systemctl daemon-reload
  nginx -t && nginx -s reload
  systemctl start anker-web.service
  ;;
 stop) systemctl stop anker-web.service ;;
 restart) systemctl restart anker-web.service ;;
esac
