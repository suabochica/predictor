---
name: commit-message
description: Writes a commit message. Use when creating a commit, writing a commit, or when the user asks to summarize changes for a commit.
---

When writing a commit message:

1. Run `git diff main...HEAD` to see all changes on this branch
2. Write a commit message following this format:

```txt
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Type

The commit type can be

- `feat`: Commits, which adds a new feature
- `fix`: Commits, that fixes a bug
- `refactor`: refactored code that neither fixes a bug nor adds a feature but rewrites/restructures your code.
- `chore` : Changes that do not relate to a fix or feature and don’t modify src or test files basically miscellaneous commits (for example, updating dependencies or modifying .gitignore file)
- `perf` : Commits are special refactor commits, geared towards improving performance.
- `ci` : Continuous integration related.
- `ops` : Commits, that affect operational components like infrastructure, deployment, backup , recovery …
- `build` : Changes that affect the build system build tool, ci pipeline, dependencies, project version, …
- `docs` : Commits, that affect documentation, such as the README.
- `style` : changes that do not affect the meaning of the code, likely related to code formatting such as white-space, missing semi-colons, etc.
- `revert`: reverts a previous commit.
- `test`:commits that add missing tests or correct existing tests

## Rules

Rules for creating a great commit message

- Limit the subject line to 50 characters
- Capitalize the subject/description line
- Do not end the subject line with a period
- Separate the subject from the body with a blank line
- Wrap the body at 72 characters
- Use the body to explain what and why
- Use the imperative mood in the subject line let it seem like you’re giving a command e.g., “feat: Add unit tests for user authentication”. Using the imperative mood in commit messages makes them more consistent and commands-like, which is helpful in understanding the actions taken.