# Dental Practice Directory

A static HTML interface prototype for a private directory of CQC-registered dental practices in England.

## Files

- `index.html` — the interface and sample data.
- `.gitignore` — common local files excluded from Git.

## Run locally

Open `index.html` in a browser. No build tools are required.

## Add to GitHub

Create a repository on GitHub, then upload the files in this folder to the repository root. Keep `index.html` at the root so the site loads at the main address.

## Deploy with Cloudflare Pages

1. In Cloudflare, open **Workers & Pages** and create a Pages project from the GitHub repository.
2. Choose no framework preset.
3. Set the build command to `exit 0` and the build output directory to `.`.
4. Deploy.

Cloudflare's static HTML deployment guide: https://developers.cloudflare.com/pages/framework-guides/deploy-anything/

## Prototype scope

The included practices and contact entries are examples. This prototype does not yet connect to the CQC API, save changes between browser sessions, provide login, or sync activity between team members.
