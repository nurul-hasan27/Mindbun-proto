/** Shape returned for every failed request. */
export interface ErrorResponse {
  status: 'error';
  message: string;
}
