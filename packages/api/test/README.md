# Testing Framework

This directory contains tests and testing utilities for the Srcbook API.

## Test Helpers

We maintain a standard approach to testing with helper functions that provide consistent mocking patterns across all tests. These are located in the `test-helpers.mts` file.

### Usage

Import the helpers in your test file:

```typescript
import { 
  mockFs, 
  mockFsSync, 
  mockDiskModule, 
  mockMcpServerManager,
  mockMcpHub,
  MockApplicationProvider, 
  createMockApp, 
  setupConsoleSpy 
} from '../test-helpers.mjs';
```

Then use them to create consistent mocks:

```typescript
// Mock fs/promises
vi.mock('node:fs/promises', () => mockFs());

// Mock fs (sync version)
vi.mock('fs', () => mockFsSync());

// Mock disk.mjs module
vi.mock('../../apps/disk.mjs', mockDiskModule());

// Mock McpServerManager
vi.mock('../../mcp/McpServerManager.mjs', () => mockMcpServerManager());

// Mock McpHub
vi.mock('../../mcp/McpHub.mjs', () => mockMcpHub());

// In your test setup
beforeEach(() => {
  vi.clearAllMocks();
  
  // Create standard test objects
  mockApp = createMockApp();
  provider = new MockApplicationProvider();
  consoleSpy = setupConsoleSpy();
});
```

### Customizing Mocks

Each mock helper accepts a customization object that will override the default behavior:

```typescript
// Customize fs mock behavior
vi.mock('node:fs/promises', () => mockFs({
  readFile: vi.fn().mockImplementation((path) => {
    if (path.includes('custom-file.json')) {
      return Promise.resolve('{"customField": "value"}');
    }
    return Promise.reject(new Error('Not found'));
  })
}));
```

## Testing Standards

1. **Use the helpers** - Always use the standardized helpers for common mocks to maintain consistency.
2. **Mock at module boundaries** - Mock external modules and services rather than internal functions.
3. **Test in isolation** - Tests should not depend on each other or external state.
4. **Clear mocks between tests** - Use `vi.clearAllMocks()` in `beforeEach` to ensure clean state.
5. **Consistent setup** - Use the standard pattern for setting up test objects.

## Examples

See `apps/disk.test.mts` and `mcp/McpServerManager.test.mts` for examples of using the test helpers. 