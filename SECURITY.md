# Security policy

## Supported versions

Only the latest release receives security fixes. The desktop app updates itself from new GitHub Releases;
a server install should follow the latest `itayp/reqspace` image.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on <https://github.com/Itayp1/reqspace/security/advisories/new>.

Include the version, steps to reproduce and the impact. You can expect an acknowledgement within a few days;
fixes are released as a new version and credited in the release notes unless you prefer otherwise.

## Scope

In scope: authentication and authorization, secret storage, the desktop app's IPC bridge, the public share links.
Out of scope: findings that need an already-compromised server or machine, and denial of service by an
authenticated admin.
