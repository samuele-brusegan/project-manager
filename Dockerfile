FROM php:8.4-apache

ENV APACHE_DOCUMENT_ROOT=/var/www/html

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
    && rm -rf /var/lib/apt/lists/*

# The official PHP Apache image already ships these extensions; keep a build
# assertion here so a future base-image change fails early and clearly.
RUN php -m | grep -qx 'curl' \
    && php -m | grep -qx 'pdo_sqlite'

WORKDIR /var/www/html

COPY index.php ./
COPY assets ./assets
COPY docker-entrypoint.sh /usr/local/bin/project-hub-entrypoint
COPY docker/php.ini /usr/local/etc/php/conf.d/project-hub.ini
COPY docker/security.conf /etc/apache2/conf-available/project-hub-security.conf

RUN a2enconf project-hub-security \
    && mkdir -p data/backups \
    && chown -R www-data:www-data data

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1/ > /dev/null || exit 1

ENTRYPOINT ["/bin/sh", "/usr/local/bin/project-hub-entrypoint"]
CMD ["apache2-foreground"]
