# Contributing to deTECHtor

Thank you for your interest in contributing to deTECHtor! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone git@github.com:your-username/detechtor.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development

### Running Tests

```bash
npm test
```

### Testing Pattern Changes

```bash
node test-patterns.js
```

### Adding New Technology Patterns

1. Edit `patterns/higher-ed-patterns.json`
2. Add your pattern following the existing format:
   ```json
   {
     "Technology Name": {
       "categories": ["Category1", "Category2"],
       "html": ["html-pattern"],
       "scripts": ["script-pattern\\.js"],
       "headers": {"Header-Name": "header-value"},
       "cookies": {"Cookie-Name": "cookie-value"},
       "higher_ed": true,
       "description": "Description of the technology"
     }
   }
   ```
3. Test your pattern: `node cli.js --url "https://example.com" --verbose`
4. Submit a pull request

### Code Style

- Follow existing code style
- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and small

## Submitting Changes

1. Write clear commit messages
2. Update documentation if needed
3. Add tests for new features
4. Ensure all tests pass: `npm test`
5. Submit a pull request with a clear description

## Reporting Issues

When reporting issues, please include:
- deTECHtor version
- Node.js version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages (if any)

## Questions?

Open an issue for questions or discussions about contributions.

Thank you for contributing! 🎉

