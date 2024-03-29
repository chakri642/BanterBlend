package main

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const defaultPort = "8080"
const defaultReadTimeout = 10 * time.Second
const defaultWriteTimeout = 10 * time.Second

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins
	},
}

type Client struct {
	ID        string
	PartnerID string
	Conn      *websocket.Conn
}

var (
	bucket       = []string{}
	clients      = make(map[string]*Client)
	clientsMutex sync.Mutex
)

func main() {
	port := getPort()
	readTimeout := defaultReadTimeout
	writeTimeout := defaultWriteTimeout

	server := &http.Server{
		Addr:         ":" + port,
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
	}

	http.HandleFunc("/ws", handleConnections)
	http.HandleFunc("/health", healthCheck)

	log.Printf("Server listening on port %s\n", port)
	log.Fatal(server.ListenAndServe())
}

func getPort() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	return port
}

func healthCheck(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	fmt.Fprintln(w, "Server is healthy, total clients:", len(clients));
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	log.Println("id:", id)

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Error upgrading to WebSocket:", err)
		return
	}
	defer ws.Close()

	clientID := id
	if clientID == "" {
		clientID = uuid.New().String()
	}

	client := &Client{ID: clientID, Conn: ws, PartnerID: "Null"}
	clientsMutex.Lock()
	clients[client.ID] = client
	bucket = append(bucket, client.ID)
	clientsMutex.Unlock()
	defer func() {
		clientsMutex.Lock()
		delete(clients, client.ID)
		clientsMutex.Unlock()
	}()

	log.Println("Client connected:", client.ID)

	makeRandomPair(client.ID)

	err = ws.WriteJSON(map[string]string{"id": client.ID, "partnerId": client.PartnerID})
	if err != nil {
		log.Println("Error writing ID:", err)
		return
	}
	if client.PartnerID != "Null" {
		err = clients[client.PartnerID].Conn.WriteJSON(map[string]string{"id": client.PartnerID, "partnerId": client.ID})
		if err != nil {
			log.Println("Error writing ID:", err)
			return
		}
	}

	for {
		var message map[string]string
		err := ws.ReadJSON(&message)
		if err != nil {
			log.Println("Error reading message:", err)
			disconnectClient(client.ID)

			removeFromBucket(client.ID)
			removeFromBucket(client.PartnerID)
			break
		}

		partnerID := client.PartnerID
		if partnerID != "Null" {
			forwardMessage(partnerID, message)
		}
	}
}

func makeRandomPair(clientID string) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	if len(bucket) <= 1 {
		return
	}

	// rand.Seed(time.Now().UnixNano())

	var (
		partnerIDIndex int
		partnerID      string
	)
	for {
		partnerIDIndex = rand.Intn(len(bucket))
		partnerID = bucket[partnerIDIndex]
		if partnerID != clientID {
			break
		}
	}

	clients[partnerID].PartnerID = clientID
	clients[clientID].PartnerID = partnerID

	removeFromBucket(partnerID)
	removeFromBucket(clientID)
}

func removeFromBucket(id string) {
	for i, v := range bucket {
		if v == id {
			bucket = append(bucket[:i], bucket[i+1:]...)
			break
		}
	}
}

func forwardMessage(partnerID string, message map[string]string) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	if pair, ok := clients[partnerID]; ok {
		err := pair.Conn.WriteJSON(message)
		if err != nil {
			log.Printf("Error writing message to client %s: %v", partnerID, err)
		}
	}
}

func disconnectClient(clientID string) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	if client, ok := clients[clientID]; ok {
		if client.Conn != nil {
			err := client.Conn.Close()
			if err != nil {
				log.Printf("Error closing WebSocket connection for client %s: %v", clientID, err)
			}
		}
		delete(clients, clientID)

		if client.PartnerID != "Null" {
			if pair, ok := clients[client.PartnerID]; ok {
				if pair.Conn != nil {
					err := pair.Conn.Close()
					if err != nil {
						log.Printf("Error closing WebSocket connection for client %s: %v", client.PartnerID, err)
					}
				}
				delete(clients, client.PartnerID)
			}
		}

		log.Println("Client disconnected:", clientID)
	}
}
