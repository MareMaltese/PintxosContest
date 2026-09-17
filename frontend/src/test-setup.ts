// jsdom does not implement the Blob URL APIs. Stub them so components that
// preview a selected file (e.g. NewEntryView) don't crash under test.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:mock-url';
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {};
}
