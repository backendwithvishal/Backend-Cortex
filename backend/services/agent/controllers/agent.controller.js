import redis from "../../../shared/redis/redis.js";
import { graph } from "../graph/supervisor.graph.js";
import { addMessage } from "../utils/memory.js";
import axios from "axios";
import { storage } from "../utils/storage.js";
import path from "path";

export const chat =
async(req,res,next)=>{

 try{

  const {

   prompt,

   conversationId,

   agent

} = req.body;

console.log(req.body)
console.log(req.file)

await addMessage(
 conversationId,
 "user",
 prompt
);

await axios.post(`${process.env.CHAT_SERVICE}/save-message`,{
  conversationId,
  role:"user",
  content:prompt
})







  const result =
  await graph.invoke({

   prompt,

   conversationId,

   userId:
   req.headers[
    "x-user-id"
   ],
   agent,
   file:req.file

  });


  console.log("after res",result)

  await addMessage(
 conversationId,
 "assistant",
 result.response
);
await axios.post(
 `${process.env.CHAT_SERVICE}/save-message`,
 {
  conversationId,
  role:"assistant",
  content:result.response,
  images:result.images,
  artifacts:
  result.artifacts || []
 }
)

  return res.json({

 success:true,

 answer:
 result.response,
 images:result.images,
 artifacts:
 result.artifacts || []

});

 }catch(error){

  next(error)

 }

}

export const getFile = async (req, res, next) => {
  try {
    const { filename } = req.params;

    if (!filename || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Invalid file name." }
      });
    }

    const fileStream = await storage.getFileStream(filename);

    const ext = path.extname(filename).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".pdf") contentType = "application/pdf";
    else if (ext === ".png") contentType = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".webp") contentType = "image/webp";
    else if (ext === ".pptx") contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

    res.setHeader("Content-Type", contentType);
    
    if (req.query.download === "true") {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    }

    fileStream.pipe(res);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "File not found." }
      });
    }
    next(error);
  }
};