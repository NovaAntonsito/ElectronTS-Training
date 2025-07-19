# Training Application

An Electron desktop application with React and TypeScript, featuring a modern LightDB-based data storage system for user management and authentication.

## Features

- **Modern Database**: Uses LightDB (SQLite-based) for efficient data storage and querying
- **User Management**: Complete CRUD operations for user data with validation
- **Authentication System**: Secure user authentication with session management
- **Cross-Platform**: Runs on Windows, macOS, and Linux
- **Type-Safe**: Built with TypeScript for better development experience
- **Performance Optimized**: Includes connection pooling, indexing, and query optimization

## Architecture

### Storage System

- **Database**: LightDB with SQLite backend
- **Connection Management**: Connection pooling for optimal performance
- **Data Integrity**: Constraints, indexes, and validation at database level
- **Backup System**: Automated backup and recovery mechanisms

### Key Components

- **UserRepository**: Handles all user data operations
- **AuthRepository**: Manages authentication and session data
- **DatabaseManager**: Core database connection and migration management
- **Error Recovery**: Automatic error detection and recovery systems

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Database Management

The application uses LightDB for data storage. The database is automatically initialized on first run.

### Database Location

- **Windows**: `%APPDATA%/training/app.lightdb`
- **macOS**: `~/Library/Application Support/training/app.lightdb`
- **Linux**: `~/.config/training/app.lightdb`

### Backup and Recovery

- Automatic backups are created during critical operations
- Manual backup can be triggered through the application
- Recovery mechanisms handle database corruption automatically

## Migration Status

This application has completed migration from JSON file storage to LightDB. The migration included:

- ✅ Complete data migration from JSON to LightDB
- ✅ Data integrity validation
- ✅ Legacy file cleanup
- ✅ Configuration updates
- ✅ Performance optimizations

## Development Notes

### Code Style

- Single quotes preferred
- No semicolons
- 100 character line width
- 2-space indentation
- TypeScript strict mode enabled

### Testing

Run tests with:

```bash
$ npm run test
```

### Type Checking

```bash
$ npm run typecheck
```

### Linting and Formatting

```bash
$ npm run lint
$ npm run format
```
