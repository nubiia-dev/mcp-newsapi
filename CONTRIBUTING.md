# Contributing to MCP NewsAPI.ai

Thank you for your interest in contributing to MCP NewsAPI.ai!

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Run tests: `npm test`

The test suite runs entirely against `src/__tests__/mock-client.ts` — no Signaturit
account or network access is required to develop or test this project.

## Code Style

This project uses ESLint and Prettier for code formatting. Before committing:

```bash
npm run lint        # Check for linting errors
npm run lint:fix    # Fix linting errors
npm run format      # Format code with Prettier
```

Pre-commit hooks will automatically run linting on staged files.

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated versioning and changelog generation.

Format: `<type>(<scope>): <description>`

Types:
- `feat`: New feature (triggers minor version bump)
- `fix`: Bug fix (triggers patch version bump)
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(signatures): add bulk cancel support
fix(preflight): correct signature field detection for nested Kids
docs: update sandbox setup instructions
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure tests pass: `npm test`
4. Ensure linting passes: `npm run lint`
5. Commit using conventional commits
6. Push and create a pull request

## Testing

Run tests with:

```bash
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

Every file in `src/tools/` has a matching test file in `src/__tests__/` that exercises
its handlers against `mock-client.ts`; `newsapi-client.ts` is tested with a mocked
`node-fetch`. Tests never need an API key.

## Working against the real NewsAPI.ai API

This repository does not include API credentials or recorded responses. If you smoke-test
against a live account, pass the key inline (`NEWSAPI_AI_API_KEY=... node ...`), never
write it to a file, and remember every search spends tokens — see `docs/api-notes.md` for
the measured costs and endpoint behaviour.

## Questions?

Feel free to open an issue for any questions or concerns.
