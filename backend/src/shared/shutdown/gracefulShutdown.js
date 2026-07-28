export const gracefulShutdown = (server, serviceName, cleanupCallbacks = []) => {
  const shutdown = async (signal) => {
    console.log(`\n[${serviceName}] ${signal} received. Starting graceful shutdown...`);

    server.close(async (err) => {
      if (err) {
        console.error(`[${serviceName}] Error closing HTTP server:`, err.message);
        process.exit(1);
      }

      console.log(`[${serviceName}] HTTP server closed.`);

      for (const cb of cleanupCallbacks) {
        try {
          await cb();
        } catch (cleanupErr) {
          console.error(`[${serviceName}] Cleanup error:`, cleanupErr.message);
        }
      }

      console.log(`[${serviceName}] Shutdown complete.`);
      process.exit(0);
    });

    setTimeout(() => {
      console.error(`[${serviceName}] Forced shutdown after timeout.`);
      process.exit(1);
    }, 15000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};
