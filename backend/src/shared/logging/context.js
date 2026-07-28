import { AsyncLocalStorage } from "async_hooks";
export const requestContext = new AsyncLocalStorage();
export default requestContext;
