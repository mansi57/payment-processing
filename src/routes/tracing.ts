/**
 * Tracing and Performance Monitoring Routes
 * Provides insights into distributed tracing, performance metrics, and system observability
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/tracingLogger';
import { 
  getActiveRequests, 
  getCompletedRequests, 
  getTracingStats,
  clearTracingData 
} from '../middleware/correlationId';

const router = Router();

/**
 * @route GET /api/tracing/health
 * @desc Get tracing system health and configuration
 * @access Public
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Tracing health check requested', 'tracing', 'health', req);
  
  const stats = getTracingStats();
  
  res.status(200).json({
    success: true,
    message: 'Distributed tracing system is operational',
    timestamp: new Date(),
    data: {
      status: 'healthy',
      configuration: stats.config,
      activeRequests: stats.activeRequests,
      performanceStats: stats.stats,
    },
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
  });
}));

/**
 * @route GET /api/tracing/requests/active
 * @desc Get currently active requests
 * @access Public
 */
router.get('/requests/active', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Active requests data requested', 'tracing', 'getActiveRequests', req);
  
  const activeRequests = getActiveRequests();
  const requestsArray = Array.from(activeRequests.entries()).map(([requestId, request]) => ({
    ...request,
    requestId, // Override any requestId from request object
    duration: Date.now() - request.startTime,
  }));
  
  res.status(200).json({
    success: true,
    message: 'Active requests retrieved',
    timestamp: new Date(),
    data: {
      totalActive: requestsArray.length,
      requests: requestsArray,
    },
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
  });
}));

/**
 * @route GET /api/tracing/requests/completed
 * @desc Get completed requests history
 * @access Public
 */
router.get('/requests/completed', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Completed requests data requested', 'tracing', 'getCompletedRequests', req);
  
  const { limit = '50', offset = '0' } = req.query;
  const limitNum = parseInt(limit as string, 10);
  const offsetNum = parseInt(offset as string, 10);
  
  const completedRequests = getCompletedRequests();
  const sortedRequests = completedRequests
    .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
    .slice(offsetNum, offsetNum + limitNum);
  
  res.status(200).json({
    success: true,
    message: 'Completed requests retrieved',
    timestamp: new Date(),
    data: {
      total: completedRequests.length,
      limit: limitNum,
      offset: offsetNum,
      requests: sortedRequests,
    },
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
  });
}));

/**
 * @route GET /api/tracing/performance
 * @desc Get performance metrics and analytics
 * @access Public
 */
router.get('/performance', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Performance metrics requested', 'tracing', 'getPerformanceMetrics', req);
  
  const stats = getTracingStats();
  const completedRequests = getCompletedRequests();
  
  // Calculate additional performance metrics
  const now = Date.now();
  const last5Min = now - 5 * 60 * 1000;
  const last1Hour = now - 60 * 60 * 1000;
  const last24Hours = now - 24 * 60 * 60 * 1000;
  
  const recent5Min = completedRequests.filter(req => req.endTime && req.endTime > last5Min);
  const recent1Hour = completedRequests.filter(req => req.endTime && req.endTime > last1Hour);
  const recent24Hours = completedRequests.filter(req => req.endTime && req.endTime > last24Hours);
  
  // Calculate percentiles
  const calculatePercentiles = (requests: any[]) => {
    const durations = requests
      .filter(r => r.duration !== undefined)
      .map(r => r.duration)
      .sort((a, b) => a - b);
    
    if (durations.length === 0) return { p50: 0, p95: 0, p99: 0 };
    
    const p50Index = Math.floor(durations.length * 0.5);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);
    
    return {
      p50: durations[p50Index] || 0,
      p95: durations[p95Index] || 0,
      p99: durations[p99Index] || 0,
    };
  };
  
  const slowRequests = completedRequests.filter(r => r.duration && r.duration > 5000);
  const errorRequests = completedRequests.filter(r => !r.success);
  
  // Group by URL
  const urlStats = completedRequests.reduce((acc, req) => {
    const url = req.url || 'unknown';
    if (!acc[url]) {
      acc[url] = { count: 0, totalDuration: 0, errors: 0 };
    }
    acc[url].count++;
    acc[url].totalDuration += req.duration || 0;
    if (!req.success) acc[url].errors++;
    return acc;
  }, {} as Record<string, any>);
  
  Object.keys(urlStats).forEach(url => {
    const stat = urlStats[url];
    stat.avgDuration = stat.count > 0 ? Math.round(stat.totalDuration / stat.count) : 0;
    stat.errorRate = stat.count > 0 ? (stat.errors / stat.count) : 0;
  });
  
  res.status(200).json({
    success: true,
    message: 'Performance metrics retrieved',
    timestamp: new Date(),
    data: {
      overview: {
        totalRequests: completedRequests.length,
        activeRequests: stats.activeRequests,
        slowRequests: slowRequests.length,
        errorRequests: errorRequests.length,
        errorRate: completedRequests.length > 0 ? errorRequests.length / completedRequests.length : 0,
      },
      timeWindows: {
        last5Minutes: {
          count: recent5Min.length,
          avgDuration: stats.stats.last5Minutes.avgDuration,
          successRate: stats.stats.last5Minutes.successRate,
          percentiles: calculatePercentiles(recent5Min),
        },
        lastHour: {
          count: recent1Hour.length,
          avgDuration: stats.stats.lastHour.avgDuration,
          successRate: stats.stats.lastHour.successRate,
          percentiles: calculatePercentiles(recent1Hour),
        },
        last24Hours: {
          count: recent24Hours.length,
          avgDuration: recent24Hours.length > 0 
            ? Math.round(recent24Hours.reduce((sum, r) => sum + (r.duration || 0), 0) / recent24Hours.length)
            : 0,
          successRate: recent24Hours.length > 0 
            ? recent24Hours.filter(r => r.success).length / recent24Hours.length
            : 0,
          percentiles: calculatePercentiles(recent24Hours),
        },
      },
      urlBreakdown: Object.entries(urlStats)
        .map(([url, stats]) => ({ url, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20), // Top 20 URLs
      slowestRequests: completedRequests
        .filter(r => r.duration !== undefined)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))
        .slice(0, 10)
        .map(r => ({
          correlationId: r.correlationId,
          requestId: r.requestId,
          method: r.method,
          url: r.url,
          duration: r.duration,
          statusCode: r.statusCode,
          endTime: r.endTime,
        })),
    },
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
  });
}));

/**
 * @route GET /api/tracing/service-calls
 * @desc Get service call tracking information
 * @access Public
 */
router.get('/service-calls', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Service calls data requested', 'tracing', 'getServiceCalls', req);
  
  const { correlationId } = req.query;
  
  if (correlationId) {
    // Get service calls for specific correlation ID
    const serviceCalls = logger.getServiceCalls(correlationId as string);
    const performanceMetrics = logger.getPerformanceMetrics(correlationId as string);
    
    res.status(200).json({
      success: true,
      message: 'Service calls retrieved for correlation ID',
      timestamp: new Date(),
      data: {
        correlationId,
        serviceCalls,
        performanceMetrics,
      },
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId,
    });
  } else {
    // Get overview of all service calls
    const allServiceCalls = logger.getAllServiceCalls();
    const overview = Array.from(allServiceCalls.entries()).map(([corrId, calls]) => ({
      correlationId: corrId,
      totalCalls: calls.length,
      completedCalls: calls.filter(c => c.duration !== undefined).length,
      totalDuration: calls.reduce((sum, call) => sum + (call.duration || 0), 0),
      services: Array.from(new Set(calls.map(c => c.service))),
      hasErrors: calls.some(c => !c.success),
    }));
    
    res.status(200).json({
      success: true,
      message: 'Service calls overview retrieved',
      timestamp: new Date(),
      data: {
        totalCorrelations: overview.length,
        overview: overview.slice(0, 50), // Limit to recent 50
      },
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId,
    });
  }
}));

/**
 * @route GET /api/tracing/correlation/:correlationId
 * @desc Get complete trace for a specific correlation ID
 * @access Public
 */
router.get('/correlation/:correlationId', asyncHandler(async (req: Request, res: Response) => {
  const { correlationId } = req.params;
  
  logger.info('Correlation trace requested', 'tracing', 'getCorrelationTrace', req, {
    targetCorrelationId: correlationId,
  });
  
  const serviceCalls = logger.getServiceCalls(correlationId);
  const performanceMetrics = logger.getPerformanceMetrics(correlationId);
  
  // Find related requests
  const allRequests = [...getActiveRequests().values(), ...getCompletedRequests()];
  const relatedRequests = allRequests.filter(r => r.correlationId === correlationId);
  
  res.status(200).json({
    success: true,
    message: 'Complete trace retrieved',
    timestamp: new Date(),
    data: {
      correlationId,
      requests: relatedRequests,
      serviceCalls,
      performanceMetrics,
      traceComplete: relatedRequests.every(r => r.endTime !== undefined),
    },
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
  });
}));

/**
 * @route POST /api/tracing/clear
 * @desc Clear tracing data (for testing)
 * @access Public
 */
router.post('/clear', asyncHandler(async (req: Request, res: Response) => {
  logger.warn('Tracing data clear requested', 'tracing', 'clearData', req);
  
  clearTracingData();
  logger.clearServiceCalls();
  
  res.status(200).json({
    success: true,
    message: 'Tracing data cleared',
    timestamp: new Date(),
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
  });
}));

export default router;
