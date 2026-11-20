#!/bin/sh
set -eu

# The data directory can be a host bind mount. Make it writable by Apache on
# every start, including the first start on a fresh checkout.
mkdir -p /var/www/html/data/backups
chown -R www-data:www-data /var/www/html/data

exec "$@"
