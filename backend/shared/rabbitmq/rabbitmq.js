import amqp from "amqplib";
import dotenv from "dotenv";

dotenv.config();

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const EXCHANGE_NAME = "cortex.events";
const DLX_NAME = "cortex.dlx";
const DLQ_NAME = "cortex.dlq";

class RabbitMQManager {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.isConnected = false;
    this.listeners = []; // Track subscriptions to re-register on reconnect
  }

  async connect() {
    if (this.isConnected) return;

    let attempts = 0;
    const maxAttempts = 10;
    const delay = 3000;

    while (attempts < maxAttempts) {
      try {
        console.log(`[RabbitMQ] Connecting to ${RABBITMQ_URL} (Attempt ${attempts + 1}/${maxAttempts})...`);
        this.connection = await amqp.connect(RABBITMQ_URL);
        this.channel = await this.connection.createChannel();
        this.isConnected = true;
        console.log("[RabbitMQ] Connected and channel created.");

        // Handle connection events
        this.connection.on("error", (err) => {
          console.error(`[RabbitMQ] Connection error: ${err.message}`);
          this.handleDisconnect();
        });

        this.connection.on("close", () => {
          console.warn("[RabbitMQ] Connection closed.");
          this.handleDisconnect();
        });

        // Initialize exchanges, queues, and bindings
        await this.initializeBroker();
        
        // Re-register any listeners
        await this.reRegisterListeners();
        return;
      } catch (error) {
        attempts++;
        console.error(`[RabbitMQ] Connection failed: ${error.message}`);
        if (attempts >= maxAttempts) {
          console.error("[RabbitMQ] Max connection attempts reached. Giving up.");
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async initializeBroker() {
    // Declare exchanges
    await this.channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
    await this.channel.assertExchange(DLX_NAME, "direct", { durable: true });

    // Declare DLQ
    await this.channel.assertQueue(DLQ_NAME, { durable: true });
    await this.channel.bindQueue(DLQ_NAME, DLX_NAME, "dead-letter");
  }

  async handleDisconnect() {
    this.isConnected = false;
    console.log("[RabbitMQ] Disconnected. Reconnecting in 5 seconds...");
    setTimeout(() => this.connect().catch((err) => console.error("[RabbitMQ] Reconnect fail:", err.message)), 5000);
  }

  async publish(routingKey, message) {
    if (!this.isConnected || !this.channel) {
      throw new Error("[RabbitMQ] Cannot publish, no active channel.");
    }
    const content = Buffer.from(JSON.stringify(message));
    return this.channel.publish(EXCHANGE_NAME, routingKey, content, {
      persistent: true,
    });
  }

  async consume(queueName, routingKey, onMessage) {
    // Keep track of listener for reconnection
    this.listeners.push({ queueName, routingKey, onMessage });

    if (!this.isConnected || !this.channel) {
      console.warn(`[RabbitMQ] Channel not ready. Queued subscription for ${queueName}`);
      return;
    }

    await this.setupSubscription(queueName, routingKey, onMessage);
  }

  async setupSubscription(queueName, routingKey, onMessage) {
    // Declare queue with DLX parameters
    await this.channel.assertQueue(queueName, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": DLX_NAME,
        "x-dead-letter-routing-key": "dead-letter",
      },
    });

    await this.channel.bindQueue(queueName, EXCHANGE_NAME, routingKey);
    console.log(`[RabbitMQ] Subscribed to queue '${queueName}' with routingKey '${routingKey}'`);

    await this.channel.consume(
      queueName,
      async (msg) => {
        if (!msg) return;

        try {
          const content = JSON.parse(msg.content.toString());
          await onMessage(content, msg);
          this.channel.ack(msg);
        } catch (error) {
          console.error(`[RabbitMQ] Error processing message on queue '${queueName}': ${error.message}`);
          
          // Retry / DLQ strategy:
          const headers = msg.properties.headers || {};
          const deathCount = (headers["x-death"] && headers["x-death"][0]?.count) || 0;
          
          if (deathCount < 3) {
            console.log(`[RabbitMQ] Rejecting message with requeue (Retries: ${deathCount}/3)`);
            this.channel.nack(msg, false, false); // Send to DLX / DLQ
          } else {
            console.error(`[RabbitMQ] Message exceeded max retries. Sending to DLQ.`);
            this.channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false }
    );
  }

  async reRegisterListeners() {
    console.log(`[RabbitMQ] Re-registering ${this.listeners.length} listeners...`);
    for (const listener of this.listeners) {
      await this.setupSubscription(listener.queueName, listener.routingKey, listener.onMessage);
    }
  }

  async close() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
      this.isConnected = false;
      console.log("[RabbitMQ] Connection closed gracefully.");
    } catch (err) {
      console.error(`[RabbitMQ] Error closing connection: ${err.message}`);
    }
  }
}

const rabbitMQ = new RabbitMQManager();
export default rabbitMQ;
