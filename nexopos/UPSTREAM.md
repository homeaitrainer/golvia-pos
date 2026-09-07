# NexoPOS Upstream Record

## Source

- Repository: https://github.com/Blair2004/NexoPOS
- Imported tag: v6.2.2
- Imported commit: 6061a93cf2d3fa0e0fb2896873315485fccc4ba1
- Import method: git subtree with squash under nexopos

## Runtime contract

- PHP: ^8.2.0
- Laravel: ^12.0
- Node.js for source asset builds: 24.x
- Module namespace: Modules mapped to modules

## License verification

The authoritative license for this imported source is the complete text in LICENSE at the imported tag. The composer.json metadata and GitHub repository label are secondary metadata and do not replace the LICENSE text. Get-FileHash is used during import review to make later comparisons reproducible.

No GOLVIA release may remove the upstream license or copyright notices. If the LICENSE text and repository metadata imply conflicting obligations, distribution pauses for legal review.

## Updating

Fetch a proposed stable tag from nexopos-upstream, inspect its release notes and license, then merge it into a disposable upgrade branch with git subtree pull. Run the platform contract, upstream tests, GOLVIA module tests, migrations, and cashier acceptance suite before production deployment.
