async function request(url, method = "GET", body) {
  const path = url.replace(/^\/api\//, "");
  const response = await fetch(`/api/attendance/pro3/${path}`, {
    method, headers: {"Content-Type": "application/json"},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.message || data.msg || data.error?.message || "操作失败");
  return data;
}
export const DataService = {get: url => request(url), post: (url, data) => request(url, "POST", data), put: (url, data) => request(url, "PUT", data), delete: url => request(url, "DELETE")};
export const AuthService = {getAuthHeaders: () => ({})};
