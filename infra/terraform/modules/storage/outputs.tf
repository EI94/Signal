output "raw_archive_bucket_name" {
  value = google_storage_bucket.raw_archive.name
}

output "raw_archive_bucket_url" {
  value = google_storage_bucket.raw_archive.url
}
