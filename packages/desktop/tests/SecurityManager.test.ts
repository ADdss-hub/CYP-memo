/**
 * SecurityManager 单元测试
 * Unit tests for SecurityManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock functions need to be defined inside the mock factory
vi.mock('electron', () => {
  const mockOnBeforeRequest = vi.fn()
  const mockOnHeadersReceived = vi.fn()
  
  return {
    app: {
      getPath: vi.fn((name: string) => `/mock/path/${name}`),
    },
    session: {
      defaultSession: {
        webRequest: {
          onBeforeRequest: mockOnBeforeRequest,
          onHeadersReceived: mockOnHeadersReceived,
        },
      },
    },
    // Export mock functions for test access
    __mocks__: {
      mockOnBeforeRequest,
      mockOnHeadersReceived,
    },
  }
})

// Import after mock setup
import { SecurityManager, getSecurityManager, resetSecurityManager } from '../src/main/SecurityManager'
import { session } from 'electron'

describe('SecurityManager', () => {
  let securityManager: SecurityManager
  let mockOnBeforeRequest: ReturnType<typeof vi.fn>
  let mockOnHeadersReceived: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    resetSecurityManager()
    securityManager = new SecurityManager()
    securityManager.initialize()
    
    // Get mock functions from session
    mockOnBeforeRequest = session.defaultSession.webRequest.onBeforeRequest as ReturnType<typeof vi.fn>
    mockOnHeadersReceived = session.defaultSession.webRequest.onHeadersReceived as ReturnType<typeof vi.fn>
  })

  describe('validateHttps', () => {
    it('should reject empty URL', () => {
      const result = securityManager.validateHttps('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('URL 不能为空')
    })

    it('should reject null URL', () => {
      const result = securityManager.validateHttps(null as unknown as string)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('URL 不能为空')
    })

    it('should allow localhost with HTTP', () => {
      const result = securityManager.validateHttps('http://localhost:3000')
      expect(result.valid).toBe(true)
      expect(result.isLocalhost).toBe(true)
    })

    it('should allow 127.0.0.1 with HTTP', () => {
      const result = securityManager.validateHttps('http://127.0.0.1:5170')
      expect(result.valid).toBe(true)
      expect(result.isLocalhost).toBe(true)
    })

    it('should allow [::1] with HTTP', () => {
      const result = securityManager.validateHttps('http://[::1]:3000')
      expect(result.valid).toBe(true)
      expect(result.isLocalhost).toBe(true)
    })

    it('should reject remote HTTP URL', () => {
      const result = securityManager.validateHttps('http://example.com/api')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('远程服务器必须使用 HTTPS 协议')
      expect(result.isLocalhost).toBe(false)
    })

    it('should allow remote HTTPS URL', () => {
      const result = securityManager.validateHttps('https://example.com/api')
      expect(result.valid).toBe(true)
      expect(result.isLocalhost).toBe(false)
    })

    it('should handle URL with whitespace', () => {
      const result = securityManager.validateHttps('  https://example.com  ')
      expect(result.valid).toBe(true)
    })

    it('should be case insensitive', () => {
      const result = securityManager.validateHttps('HTTPS://EXAMPLE.COM')
      expect(result.valid).toBe(true)
    })
  })

  describe('isLocalhostUrl', () => {
    it('should identify localhost', () => {
      expect(securityManager.isLocalhostUrl('http://localhost:3000')).toBe(true)
      expect(securityManager.isLocalhostUrl('https://localhost/api')).toBe(true)
    })

    it('should identify 127.0.0.1', () => {
      expect(securityManager.isLocalhostUrl('http://127.0.0.1:5170')).toBe(true)
      expect(securityManager.isLocalhostUrl('https://127.0.0.1/api')).toBe(true)
    })

    it('should identify IPv6 localhost', () => {
      expect(securityManager.isLocalhostUrl('http://[::1]:3000')).toBe(true)
    })

    it('should not identify remote URLs as localhost', () => {
      expect(securityManager.isLocalhostUrl('http://example.com')).toBe(false)
      expect(securityManager.isLocalhostUrl('https://api.example.com')).toBe(false)
    })
  })

  describe('enforceHttps', () => {
    it('should register request interceptor', () => {
      securityManager.enforceHttps()
      expect(mockOnBeforeRequest).toHaveBeenCalled()
    })

    it('should allow HTTPS requests', () => {
      securityManager.enforceHttps()
      
      const callback = mockOnBeforeRequest.mock.calls[0][0]
      const mockCallback = vi.fn()
      
      callback({ url: 'https://example.com/api' }, mockCallback)
      expect(mockCallback).toHaveBeenCalledWith({ cancel: false })
    })

    it('should allow localhost HTTP requests', () => {
      securityManager.enforceHttps()
      
      const callback = mockOnBeforeRequest.mock.calls[0][0]
      const mockCallback = vi.fn()
      
      callback({ url: 'http://localhost:3000/api' }, mockCallback)
      expect(mockCallback).toHaveBeenCalledWith({ cancel: false })
    })

    it('should allow 127.0.0.1 HTTP requests', () => {
      securityManager.enforceHttps()
      
      const callback = mockOnBeforeRequest.mock.calls[0][0]
      const mockCallback = vi.fn()
      
      callback({ url: 'http://127.0.0.1:5170/api' }, mockCallback)
      expect(mockCallback).toHaveBeenCalledWith({ cancel: false })
    })

    it('should block remote HTTP requests', () => {
      securityManager.enforceHttps()
      
      const callback = mockOnBeforeRequest.mock.calls[0][0]
      const mockCallback = vi.fn()
      
      callback({ url: 'http://example.com/api' }, mockCallback)
      expect(mockCallback).toHaveBeenCalledWith({ cancel: true })
    })

    it('should allow devtools protocol', () => {
      securityManager.enforceHttps()
      
      const callback = mockOnBeforeRequest.mock.calls[0][0]
      const mockCallback = vi.fn()
      
      callback({ url: 'devtools://devtools/bundled/inspector.html' }, mockCallback)
      expect(mockCallback).toHaveBeenCalledWith({ cancel: false })
    })

    it('should allow file protocol', () => {
      securityManager.enforceHttps()
      
      const callback = mockOnBeforeRequest.mock.calls[0][0]
      const mockCallback = vi.fn()
      
      callback({ url: 'file:///path/to/file.html' }, mockCallback)
      expect(mockCallback).toHaveBeenCalledWith({ cancel: false })
    })

    it('should allow data protocol', () => {
      securityManager.enforceHttps()
      
      const callback = mockOnBeforeRequest.mock.calls[0][0]
      const mockCallback = vi.fn()
      
      callback({ url: 'data:image/png;base64,abc123' }, mockCallback)
      expect(mockCallback).toHaveBeenCalledWith({ cancel: false })
    })
  })

  describe('configureCSP', () => {
    it('should register headers interceptor', () => {
      securityManager.configureCSP()
      expect(mockOnHeadersReceived).toHaveBeenCalled()
    })

    it('should set CSP enabled flag', () => {
      expect(securityManager.isCSPEnabled()).toBe(false)
      securityManager.configureCSP()
      expect(securityManager.isCSPEnabled()).toBe(true)
    })

    it('should add CSP header to responses', () => {
      securityManager.configureCSP()
      
      const callback = mockOnHeadersReceived.mock.calls[0][0]
      const mockCallback = vi.fn()
      
      callback({ responseHeaders: { 'Content-Type': ['text/html'] } }, mockCallback)
      
      expect(mockCallback).toHaveBeenCalled()
      const callArg = mockCallback.mock.calls[0][0]
      expect(callArg.responseHeaders['Content-Security-Policy']).toBeDefined()
    })
  })

  describe('getCSPConfig', () => {
    it('should include default-src self', () => {
      const csp = securityManager.getCSPConfig(false)
      expect(csp).toContain("default-src 'self'")
    })

    it('should include object-src none', () => {
      const csp = securityManager.getCSPConfig(false)
      expect(csp).toContain("object-src 'none'")
    })

    it('should include frame-src none', () => {
      const csp = securityManager.getCSPConfig(false)
      expect(csp).toContain("frame-src 'none'")
    })

    it('should include frame-ancestors none', () => {
      const csp = securityManager.getCSPConfig(false)
      expect(csp).toContain("frame-ancestors 'none'")
    })

    it('should allow unsafe-eval in dev mode', () => {
      const csp = securityManager.getCSPConfig(true)
      expect(csp).toContain("'unsafe-eval'")
    })

    it('should not allow unsafe-eval in production', () => {
      const csp = securityManager.getCSPConfig(false)
      expect(csp).not.toContain("'unsafe-eval'")
    })

    it('should allow websocket in dev mode', () => {
      const csp = securityManager.getCSPConfig(true)
      expect(csp).toContain('ws://localhost:*')
    })

    it('should include remote server URL when provided', () => {
      const csp = securityManager.getCSPConfig(false, 'https://api.example.com')
      expect(csp).toContain('https://api.example.com')
    })

    it('should allow HTTPS connections', () => {
      const csp = securityManager.getCSPConfig(false)
      expect(csp).toContain('https:')
    })
  })

  describe('getSecurityManager singleton', () => {
    it('should return the same instance', () => {
      resetSecurityManager()
      const instance1 = getSecurityManager()
      const instance2 = getSecurityManager()
      expect(instance1).toBe(instance2)
    })
  })
})
