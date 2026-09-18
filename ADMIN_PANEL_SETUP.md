# v1124 AUTH Admin Panel

The Admin Panel is available at `/admin` and is protected by the v1124 AUTH session plus a server-side `ADMIN` role.

## Bootstrap administrator

If the AUTH store has no administrator, the AUTH server creates one automatically:

- Username: `admin`
- Password: `admin`
- Email: `admin@v1124.local`
- Role: `ADMIN`
- Status: `ACTIVE`

After signing in, use the Admin menu to change the administrator username or password.

## Recovery email delivery

Password reset/recovery generates a temporary password and invalidates the target user's existing sessions. The Admin Panel can send the temporary password through Resend when these environment variables are configured:

- `RESEND_API_KEY`
- `RESEND_FROM`

If they are not configured, the password is still generated and displayed once to the administrator, with delivery marked `NOT CONFIGURED`.

## Admin API

`GET /api/admin` returns authorized users, recovery tickets, and counts.

`GET /api/admin?resource=status` returns server/account status.

`POST /api/admin` supports:

- `set-status`
- `set-role`
- `reset-password`
- `process-ticket`
- `set-ticket-status`

All admin mutations require an authenticated session whose server-side role is `ADMIN`.
