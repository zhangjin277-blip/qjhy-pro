import { UploadDropzone } from "../_components/upload-dropzone";

export default function UploadPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">上传投放数据</h1>
      <p className="text-sm text-slate-600">
        从百应/巨量后台导出小时级 Excel，拖入下方区域。每个文件独立成一个批次。
      </p>
      <UploadDropzone />
    </div>
  );
}
