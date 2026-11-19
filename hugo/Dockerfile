FROM hugomods/hugo:exts AS build
WORKDIR /src
COPY . /src
RUN hugo --destination /public --cleanDestinationDir

FROM nginx:alpine
COPY --from=build /public /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
