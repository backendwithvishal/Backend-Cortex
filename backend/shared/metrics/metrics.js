import process from "process";

const metricsState = {
  requestsTotal: new Map(),
  requestDurations: new Map(),
};

/**
 * Middleware tracking HTTP request metrics for Prometheus output.
 */
export const metricsMiddleware = (req, res, next) => {
  const startTime = process.hrtime();

  res.on("finish", () => {
    const diff = process.hrtime(startTime);
    const durationSeconds = diff[0] + diff[1] / 1e9;
    const path = req.route ? req.route.path : req.path || "unknown";
    const key = `method="${req.method}",path="${path}",status="${res.statusCode}"`;

    // Increment request count
    const currentCount = metricsState.requestsTotal.get(key) || 0;
    metricsState.requestsTotal.set(key, currentCount + 1);

    // Accumulate request duration
    const currentDuration = metricsState.requestDurations.get(key) || 0;
    metricsState.requestDurations.set(key, currentDuration + durationSeconds);
  });

  next();
};

/**
 * Express handler exposing metrics in Prometheus text format on /metrics.
 */
export const getMetrics = (serviceName = "service") => {
  return (req, res) => {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptimeSeconds = process.uptime();

    let output = `# HELP service_info Service information\n`;
    output += `# TYPE service_info gauge\n`;
    output += `service_info{name="${serviceName}"} 1\n\n`;

    output += `# HELP process_uptime_seconds Process uptime in seconds\n`;
    output += `# TYPE process_uptime_seconds counter\n`;
    output += `process_uptime_seconds ${uptimeSeconds.toFixed(3)}\n\n`;

    output += `# HELP process_resident_memory_bytes Resident memory size in bytes\n`;
    output += `# TYPE process_resident_memory_bytes gauge\n`;
    output += `process_resident_memory_bytes ${memUsage.rss}\n\n`;

    output += `# HELP nodejs_heap_size_total_bytes Total Heap Size in bytes\n`;
    output += `# TYPE nodejs_heap_size_total_bytes gauge\n`;
    output += `nodejs_heap_size_total_bytes ${memUsage.heapTotal}\n\n`;

    output += `# HELP nodejs_heap_size_used_bytes Heap Size used in bytes\n`;
    output += `# TYPE nodejs_heap_size_used_bytes gauge\n`;
    output += `nodejs_heap_size_used_bytes ${memUsage.heapUsed}\n\n`;

    output += `# HELP process_cpu_user_seconds_total Total user CPU time in seconds\n`;
    output += `# TYPE process_cpu_user_seconds_total counter\n`;
    output += `process_cpu_user_seconds_total ${(cpuUsage.user / 1e6).toFixed(6)}\n\n`;

    output += `# HELP process_cpu_system_seconds_total Total system CPU time in seconds\n`;
    output += `# TYPE process_cpu_system_seconds_total counter\n`;
    output += `process_cpu_system_seconds_total ${(cpuUsage.system / 1e6).toFixed(6)}\n\n`;

    output += `# HELP http_requests_total Total number of HTTP requests\n`;
    output += `# TYPE http_requests_total counter\n`;
    for (const [labels, count] of metricsState.requestsTotal.entries()) {
      output += `http_requests_total{service="${serviceName}",${labels}} ${count}\n`;
    }
    output += `\n`;

    output += `# HELP http_request_duration_seconds Total HTTP request duration in seconds\n`;
    output += `# TYPE http_request_duration_seconds counter\n`;
    for (const [labels, duration] of metricsState.requestDurations.entries()) {
      output += `http_request_duration_seconds{service="${serviceName}",${labels}} ${duration.toFixed(6)}\n`;
    }

    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(output);
  };
};
