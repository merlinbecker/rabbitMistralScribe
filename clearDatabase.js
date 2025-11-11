
import Database from "@replit/database";

async function clearDatabase() {
  const db = new Database();
  
  console.log('🗑️  Starting database cleanup...');
  
  try {
    // Get all keys - list() returns a string with keys separated by newlines
    const keysString = await db.list();
    const keys = keysString ? keysString.split('\n').filter(k => k.length > 0) : [];
    
    console.log(`📊 Found ${keys.length} keys in database`);
    
    if (keys.length === 0) {
      console.log('✅ Database is already empty');
      return;
    }
    
    // Delete all keys
    let deleted = 0;
    for (const key of keys) {
      await db.delete(key);
      deleted++;
      if (deleted % 10 === 0) {
        console.log(`🔄 Deleted ${deleted}/${keys.length} keys...`);
      }
    }
    
    console.log(`✅ Successfully deleted ${deleted} keys from database`);
    console.log('🎉 Database cleared!');
    
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    process.exit(1);
  }
}

clearDatabase();
