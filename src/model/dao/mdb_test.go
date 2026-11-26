package dao

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/GMWalletApp/epusdt/model/mdb"
	"github.com/GMWalletApp/epusdt/util/log"
	mysqlconfig "github.com/go-sql-driver/mysql"
	"github.com/spf13/viper"
	"go.uber.org/zap"
)

func TestSQLiteDefaultAndReopen(t *testing.T) {
	previousDB, previousLogger := Mdb, log.Sugar
	log.Sugar = zap.NewNop().Sugar()
	ResetMdbTableInitForTest()
	t.Cleanup(func() {
		Mdb, log.Sugar = previousDB, previousLogger
		ResetMdbTableInitForTest()
		viper.Reset()
	})
	viper.Set("sqlite_database_filename", filepath.Join(t.TempDir(), "existing.db"))
	open := func() func() error {
		t.Helper()
		if err := DBInit(); err != nil {
			t.Fatal(err)
		}
		db, err := Mdb.DB()
		if err != nil {
			t.Fatal(err)
		}
		return db.Close
	}
	closeDB := open()
	row := mdb.Setting{Key: "test.restart", Value: "persisted"}
	if err := Mdb.Create(&row).Error; err != nil {
		_ = closeDB()
		t.Fatal(err)
	}
	if err := closeDB(); err != nil {
		t.Fatal(err)
	}

	ResetMdbTableInitForTest()
	viper.Set("db_type", "SQLite")
	viper.Set("mysql_host", "unused-legacy-setting")
	closeDB = open()
	defer closeDB()
	var restored mdb.Setting
	if err := Mdb.First(&restored, row.ID).Error; err != nil || restored.Value != row.Value {
		t.Fatalf("reopened setting = %q, want %q (error %v)", restored.Value, row.Value, err)
	}
}

func TestMySQL57StartupMigratesLegacyOrders(t *testing.T) {
	rawDSN := os.Getenv("EPUSDT_MYSQL57_STARTUP_DSN")
	if rawDSN == "" {
		t.Skip("requires an empty MySQL 5.7 database named epusdt_merge_mysql57_test")
	}
	dsn, err := mysqlconfig.ParseDSN(rawDSN)
	if err != nil {
		t.Fatal(err)
	}
	host, port, err := net.SplitHostPort(dsn.Addr)
	if err != nil || dsn.Net != "tcp" || dsn.DBName != "epusdt_merge_mysql57_test" {
		t.Fatal("requires a dedicated TCP database named epusdt_merge_mysql57_test")
	}
	previousDB, previousLogger := Mdb, log.Sugar
	log.Sugar = zap.NewNop().Sugar()
	viper.Reset()
	ResetMdbTableInitForTest()
	t.Cleanup(func() {
		if Mdb != nil && Mdb != previousDB {
			if pool, err := Mdb.DB(); err == nil {
				_ = pool.Close()
			}
		}
		Mdb, log.Sugar = previousDB, previousLogger
		ResetMdbTableInitForTest()
		viper.Reset()
	})
	viper.Set("mysql_host", host)
	viper.Set("mysql_port", port)
	viper.Set("mysql_database", dsn.DBName)
	viper.Set("mysql_user", dsn.User)
	viper.Set("mysql_passwd", dsn.Passwd)

	if err := MysqlInit(); err != nil {
		t.Fatal(err)
	}
	var version string
	if err := Mdb.Raw("SELECT VERSION()").Scan(&version).Error; err != nil || !strings.HasPrefix(version, "5.7.") {
		t.Fatalf("expected MySQL 5.7, got %q (%v)", version, err)
	}
	var tables int
	if err := Mdb.Raw("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()").Scan(&tables).Error; err != nil || tables != 0 {
		t.Fatalf("test requires an empty database, found %d tables (%v)", tables, err)
	}
	if err := Mdb.Exec(`CREATE TABLE orders (
		id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
		trade_id varchar(255) NOT NULL,
		order_id varchar(255) NOT NULL,
		UNIQUE KEY orders_trade_id_uindex (trade_id),
		UNIQUE KEY orders_order_id_uindex (order_id)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).Error; err != nil {
		t.Fatal(err)
	}
	legacyTradeID := strings.Repeat("t", 220)
	if err := Mdb.Exec("INSERT INTO orders (trade_id, order_id) VALUES (?, ?)", legacyTradeID, "legacy-order").Error; err != nil {
		t.Fatal(err)
	}
	for _, dbType := range []string{"", "mysql"} {
		t.Run(fmt.Sprintf("db_type=%s", dbType), func(t *testing.T) {
			pool, err := Mdb.DB()
			if err != nil {
				t.Fatal(err)
			}
			if err := pool.Close(); err != nil {
				t.Fatal(err)
			}
			viper.Set("db_type", dbType)
			ResetMdbTableInitForTest()
			if err := DBInit(); err != nil {
				t.Fatal(err)
			}

			var order mdb.Orders
			if err := Mdb.Where("order_id = ?", "legacy-order").Take(&order).Error; err != nil || order.TradeId != legacyTradeID {
				t.Fatalf("existing order changed: trade ID length %d (%v)", len(order.TradeId), err)
			}
			for _, model := range []interface{}{&mdb.CallbackDelivery{}, &mdb.PaymentTxClaim{}, &mdb.CallbackSigningKey{}, &mdb.PaymentConfirmation{}} {
				if !Mdb.Migrator().HasTable(model) {
					t.Errorf("missing table for %T", model)
				}
			}
			var token mdb.ChainToken
			if err := Mdb.Where("network = ? AND symbol = ?", mdb.NetworkTron, "A7A5").Take(&token).Error; err != nil || token.Enabled {
				t.Fatalf("default A7A5 should exist and remain disabled (%v)", err)
			}
		})
	}
}
