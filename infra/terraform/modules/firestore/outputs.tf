output "database_name" {
  value = var.manage_firestore_database ? google_firestore_database.default[0].name : null
}

output "database_id" {
  value = var.manage_firestore_database ? google_firestore_database.default[0].id : null
}
