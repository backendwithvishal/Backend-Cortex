import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: [true, "User ID is required"],
    index: true
  },
  title: {
    type: String,
    required: [true, "Title is required"],
    trim: true,
    default: "New Chat"
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Compound index for listing conversations of a user ordered by update time
conversationSchema.index({ userId: 1, updatedAt: -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;