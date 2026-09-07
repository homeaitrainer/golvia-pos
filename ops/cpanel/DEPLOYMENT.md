# GOLVIA NexoPOS cPanel Deployment

## Staging identity

- URL: https://pos.golvia.my
- Account home: /home/proper15
- Application source: /home/proper15/nexopos
- Required document root: /home/proper15/nexopos/public
- Staging database: proper15_golvia
- Staging database user: proper15_golviauser
- Time zone: Asia/Kuala_Lumpur
- Currency: MYR

The database password and APP_KEY are entered directly into /home/proper15/nexopos/.env. They are never copied into this repository, screenshots, shell history, or verification reports.

## Hosting gate

1. Confirm Terminal or SSH, Composer 2, PHP 8.2 or newer, Cron Jobs, AutoSSL, and the required PHP extensions.
2. Confirm MySQL 8.4 or newer or MariaDB 10.11 or newer.
3. Change the subdomain document root to /home/proper15/nexopos/public. Stop if cPanel restricts it; request the hosting provider to set it. Do not upload the entire Laravel project under a public document root as a workaround.
4. Enable cPanel Directory Privacy for staging before the first application response is exposed.

## Install staging

1. Upload or check out the approved nexopos directory to /home/proper15/nexopos.
2. Select the approved PHP version for pos.golvia.my and for CLI commands.
3. Run `composer install --no-dev --prefer-dist --optimize-autoloader`.
4. Copy `.env.example` to `.env` and run `php artisan key:generate`.
5. Set `APP_ENV=staging`, `APP_DEBUG=false`, `APP_URL=https://pos.golvia.my`, `APP_TIMEZONE=Asia/Kuala_Lumpur`, `DB_CONNECTION=mysql`, `DB_HOST=localhost`, `DB_PORT=3306`, `DB_DATABASE=proper15_golvia`, and `DB_USERNAME=proper15_golviauser`.
6. Enter the database password privately in `DB_PASSWORD`.
7. Run `php artisan storage:link`, `php artisan optimize:clear`, and `php artisan optimize`.
8. Complete the NexoPOS setup wizard using a unique administrator password.

## Scheduler

Create a cPanel Cron Job that runs once per minute with the cPanel PHP binary selected during preflight:

```shell
php /home/proper15/nexopos/artisan schedule:run >> /home/proper15/nexopos/storage/logs/scheduler.log 2>&1
```

If Supervisor is unavailable, keep queue work synchronous for the baseline. Before enabling any feature that requires asynchronous queues or Reverb, create and test a bounded cPanel-compatible worker strategy or move to a compatible host.

## SSL and public access

1. Wait for AutoSSL to issue a valid certificate for pos.golvia.my.
2. Enable Force HTTPS Redirect only after HTTPS loads without a certificate error.
3. Keep Directory Privacy enabled throughout staging.
4. Verify `APP_DEBUG=false` and confirm that error pages contain no stack trace.

## Backup and rollback

1. Export proper15_golvia before every schema migration.
2. Back up /home/proper15/nexopos/storage/app and uploaded media.
3. Store one encrypted copy outside the cPanel account.
4. Roll application files back to the preceding approved release if a code-only deployment fails.
5. Restore the database only when the release-specific migration procedure says the schema cannot roll back safely.
