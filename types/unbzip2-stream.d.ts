declare module "unbzip2-stream" {
  import { Transform } from "node:stream";
  function bz2(): Transform;
  export default bz2;
}
