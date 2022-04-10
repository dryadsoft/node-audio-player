## Server with Nest.js

## pm2

```s
$ pm2 start dist/main.js --name "nmp" -o /home/pi/log/nmp.log -e /home/pi/log/nmp.log --merge-logs
$ pm2 delete nmp && pm2 start dist/main.js --name "nmp" -o /home/pi/log/nmp.log -e /home/pi/log/nmp.log --merge-logs
```
