import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    default: ""
  }
}, {
  _id: false
});

const artifactSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  files: [fileSchema],
  createdAt: {
    type: String,
    required: true
  }
}, {
  _id: false
});

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    required: [true, "Conversation ID is required"],
    index: true
  },
  role: {
    type: String,
    required: [true, "Role is required"],
    enum: ["user", "assistant"]
  },
  content: {
    type: String,
    required: [true, "Content is required"]
  },
  images: {
    type: [String],
    default: []
  },
  artifacts: {
    type: [artifactSchema],
    default: []
  }
}, {
  timestamps: true
});

// Compound index for quick sequence loading of conversation messages
messageSchema.index({ conversationId: 1, createdAt: 1 });

const Message = mongoose.model("Message", messageSchema);
export default Message;