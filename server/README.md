## Server

```bash
$ yarn install
$ yarn build
$ pm2
```

## pm2

```s
$ pm2 start dist/bin/www.js --name "nmp" -o /home/pi/log/nmp.log -e /home/pi/log/nmp.log --merge-logs
$ pm2 delete nmp && pm2 start dist/bin/www.js --name "nmp" -o /home/pi/log/nmp.log -e /home/pi/log/nmp.log --merge-logs
```
