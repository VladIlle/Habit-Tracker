# =====================================================
# HabitFlow Frontend - Dockerfile
# Nginx serveste fisierele statice
# =====================================================

FROM nginx:alpine

# Copiem configuratia Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiem toate fisierele frontend
COPY index.html  /usr/share/nginx/html/index.html
COPY style.css   /usr/share/nginx/html/style.css
COPY state.js    /usr/share/nginx/html/state.js
COPY auth.js     /usr/share/nginx/html/auth.js
COPY habits.js   /usr/share/nginx/html/habits.js
COPY calendar.js /usr/share/nginx/html/calendar.js
COPY feed.js     /usr/share/nginx/html/feed.js
COPY messages.js /usr/share/nginx/html/messages.js
COPY admin.js    /usr/share/nginx/html/admin.js
COPY friends.js  /usr/share/nginx/html/friends.js
COPY app.js      /usr/share/nginx/html/app.js

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
